#!/usr/bin/env python3
"""
embed_legal_data.py — Batch pipeline: crawlerdb.cyprus → Mindlex LegalDocuments

Two modes for reading crawlerdb (auto-selected or forced via env):
  - DIRECT: psycopg2 TCP connection (works when crawlerdb port is exposed or reachable)
  - DOCKER_EXEC: streams data via `docker exec <container> psql COPY TO STDOUT CSV`
                 (fallback when container has no exposed port / disconnected network)

Usage:
    python embed_legal_data.py [--batch-size N] [--limit N] [--offset N]

Env vars:
    CRAWL_MODE          direct | docker_exec | auto (default: auto)
    CRAWL_CONTAINER     docker container name/ID for docker_exec mode (default: postgres)
    CRAWL_DB_HOST       default: localhost
    CRAWL_DB_PORT       default: 5432
    CRAWL_DB_NAME       default: crawlerdb
    CRAWL_DB_USER       default: crawler
    CRAWL_DB_PASS       default: crawler
    MINDLEX_DB_HOST     default: localhost
    MINDLEX_DB_PORT     default: 55432
    MINDLEX_DB_NAME     default: mylaw
    MINDLEX_DB_USER     default: postgres
    MINDLEX_DB_PASS     default: postgres
"""

import csv
import io
import os
import subprocess
import sys
import argparse
import logging
import time
from datetime import datetime, timezone

# CPU-only: avoids kernel mismatch on mixed GPU hosts.
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
# Offline: model may be pre-baked in image or mounted via -v.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np
import psycopg2
import psycopg2.extras
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Column order for CSV output / dict keys (must match SELECT order in queries)
COLUMNS = ["id", "url", "title", "content", "date", "case_number", "jurisdiction", "category", "parties"]


# ── Crawlerdb readers ──────────────────────────────────────────────────────────

def _can_connect_direct() -> bool:
    """Return True if crawlerdb is reachable via direct TCP."""
    try:
        conn = psycopg2.connect(
            host=os.getenv("CRAWL_DB_HOST", "localhost"),
            port=int(os.getenv("CRAWL_DB_PORT", "5432")),
            dbname=os.getenv("CRAWL_DB_NAME", "crawlerdb"),
            user=os.getenv("CRAWL_DB_USER", "crawler"),
            password=os.getenv("CRAWL_DB_PASS", "crawler"),
            connect_timeout=3,
        )
        conn.close()
        return True
    except Exception:
        return False


def _count_eligible_direct() -> int:
    conn = psycopg2.connect(
        host=os.getenv("CRAWL_DB_HOST", "localhost"),
        port=int(os.getenv("CRAWL_DB_PORT", "5432")),
        dbname=os.getenv("CRAWL_DB_NAME", "crawlerdb"),
        user=os.getenv("CRAWL_DB_USER", "crawler"),
        password=os.getenv("CRAWL_DB_PASS", "crawler"),
    )
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM cyprus WHERE content IS NOT NULL AND content != ''")
        n = cur.fetchone()[0]
    conn.close()
    return n


def _stream_direct(batch_size: int, limit: int, offset: int):
    """Yield dicts from crawlerdb using a server-side cursor (direct TCP)."""
    conn = psycopg2.connect(
        host=os.getenv("CRAWL_DB_HOST", "localhost"),
        port=int(os.getenv("CRAWL_DB_PORT", "5432")),
        dbname=os.getenv("CRAWL_DB_NAME", "crawlerdb"),
        user=os.getenv("CRAWL_DB_USER", "crawler"),
        password=os.getenv("CRAWL_DB_PASS", "crawler"),
    )
    conn.set_session(readonly=True, autocommit=True)

    parts = [
        "SELECT id,url,title,content,date,case_number,jurisdiction,category,parties",
        "FROM cyprus WHERE content IS NOT NULL AND content != ''",
        "ORDER BY id",
    ]
    if limit > 0:
        parts.append(f"LIMIT {limit}")
    if offset > 0:
        parts.append(f"OFFSET {offset}")
    query = " ".join(parts)

    with conn.cursor(name="embed_stream", cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.itersize = batch_size * 4
        cur.execute(query)
        for row in cur:
            yield dict(row)
    conn.close()


def _count_eligible_exec(container: str) -> int:
    result = subprocess.run(
        ["docker", "exec", container,
         "psql", "-U", os.getenv("CRAWL_DB_USER", "crawler"),
         "-d", os.getenv("CRAWL_DB_NAME", "crawlerdb"),
         "-t", "-c",
         "SELECT COUNT(*) FROM cyprus WHERE content IS NOT NULL AND content != ''"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"docker exec count failed: {result.stderr}")
    return int(result.stdout.strip())


def _stream_exec(container: str, limit: int, offset: int):
    """Yield dicts from crawlerdb by piping psql COPY TO STDOUT CSV through docker exec."""
    parts = [
        "COPY (",
        "SELECT id,url,title,content,date,case_number,jurisdiction,category,parties",
        "FROM cyprus WHERE content IS NOT NULL AND content != ''",
        "ORDER BY id",
    ]
    if limit > 0:
        parts.append(f"LIMIT {limit}")
    if offset > 0:
        parts.append(f"OFFSET {offset}")
    parts.append(") TO STDOUT WITH (FORMAT CSV, HEADER FALSE)")
    sql = " ".join(parts)

    cmd = [
        "docker", "exec", container,
        "psql", "-U", os.getenv("CRAWL_DB_USER", "crawler"),
        "-d", os.getenv("CRAWL_DB_NAME", "crawlerdb"),
        "-c", sql,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    wrapper = io.TextIOWrapper(proc.stdout, encoding="utf-8", errors="replace")
    reader = csv.reader(wrapper)
    for row in reader:
        if len(row) == len(COLUMNS):
            yield {
                "id": int(row[0]),
                "url": row[1],
                "title": row[2] or None,
                "content": row[3],
                "date": row[4] or None,
                "case_number": row[5] or None,
                "jurisdiction": row[6] or None,
                "category": row[7] or None,
                "parties": row[8] or None,
            }

    proc.stdout.close()
    proc.wait()
    if proc.returncode != 0:
        stderr = proc.stderr.read().decode("utf-8", errors="replace")
        if stderr.strip():
            log.warning("docker exec stderr: %s", stderr.strip())


# ── Mindlex DB helpers ─────────────────────────────────────────────────────────

def _mindlex_connect():
    return psycopg2.connect(
        host=os.getenv("MINDLEX_DB_HOST", "localhost"),
        port=int(os.getenv("MINDLEX_DB_PORT", "55432")),
        dbname=os.getenv("MINDLEX_DB_NAME", "mylaw"),
        user=os.getenv("MINDLEX_DB_USER", "postgres"),
        password=os.getenv("MINDLEX_DB_PASS", "postgres"),
    )


def _load_embedded_ids(conn) -> set:
    """Return IDs already in LegalDocuments with a non-null Embedding (for idempotency)."""
    with conn.cursor() as cur:
        cur.execute('SELECT "Id" FROM "LegalDocuments" WHERE "Embedding" IS NOT NULL')
        return {row[0] for row in cur.fetchall()}


def _emb_to_pg(emb: np.ndarray) -> str:
    """Convert float32 numpy array to pgvector literal '[x,y,...]'."""
    return "[" + ",".join(f"{float(x):.8f}" for x in emb) + "]"


def _upsert_batch(conn, rows: list, embeddings: np.ndarray) -> None:
    """Upsert a batch into LegalDocuments; ON CONFLICT (Id) updates Embedding only."""
    now = datetime.now(timezone.utc)
    records = [
        (
            row["id"],
            row["url"],
            row.get("title"),
            row["content"],
            row.get("case_number"),
            row.get("jurisdiction"),
            row.get("category"),
            row.get("parties"),
            row.get("date"),
            _emb_to_pg(emb),
            now,   # EmbeddedAt
            now,   # CreatedAt (ignored on conflict)
        )
        for row, emb in zip(rows, embeddings)
    ]

    sql = """
        INSERT INTO "LegalDocuments"
            ("Id","SourceUrl","Title","Content","CaseNumber","Jurisdiction",
             "Category","Parties","CaseDate","Embedding","EmbeddedAt","CreatedAt")
        VALUES %s
        ON CONFLICT ("Id") DO UPDATE SET
            "Embedding"  = EXCLUDED."Embedding",
            "EmbeddedAt" = EXCLUDED."EmbeddedAt"
    """
    template = "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s,%s)"

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, records, template=template, page_size=100)
    conn.commit()


# ── Text helper ────────────────────────────────────────────────────────────────

def _build_text(row: dict) -> str:
    """Compose the text to embed.

    multilingual-e5 requires a "passage: " prefix for documents.
    Use "query: " prefix when querying at retrieval time (in ChatController).
    """
    title = (row.get("title") or "").strip()
    content = (row.get("content") or "")[:2000].strip()
    body = f"{title} {content}".strip()
    return f"passage: {body}"


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Embed crawlerdb.cyprus records into Mindlex pgvector LegalDocuments"
    )
    parser.add_argument("--batch-size", type=int, default=100,
                        help="Records per embedding+insert batch (default: 100)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max records to process; 0 = no limit (default: 0)")
    parser.add_argument("--offset", type=int, default=0,
                        help="Skip first N rows from crawlerdb (default: 0)")
    args = parser.parse_args()

    # ── Load model ─────────────────────────────────────────────────────────────
    MODEL_ID = "intfloat/multilingual-e5-small"
    log.info("Loading %s (384-dim, CPU-only, Greek+English) ...", MODEL_ID)
    model = SentenceTransformer(MODEL_ID, device="cpu")
    log.info("Model ready.")

    # ── Select crawlerdb read mode ─────────────────────────────────────────────
    mode = os.getenv("CRAWL_MODE", "auto").lower()
    container = os.getenv("CRAWL_CONTAINER", "postgres")

    if mode == "auto":
        if _can_connect_direct():
            mode = "direct"
            log.info("Crawlerdb mode: direct TCP (%s:%s)",
                     os.getenv("CRAWL_DB_HOST", "localhost"), os.getenv("CRAWL_DB_PORT", "5432"))
        else:
            mode = "docker_exec"
            log.info("Crawlerdb mode: docker_exec (container=%s)", container)
    else:
        log.info("Crawlerdb mode: %s%s", mode,
                 f" (container={container})" if mode == "docker_exec" else "")

    # ── Count eligible rows ────────────────────────────────────────────────────
    try:
        if mode == "direct":
            total_eligible = _count_eligible_direct()
        else:
            total_eligible = _count_eligible_exec(container)
    except Exception as exc:
        log.error("Cannot count crawlerdb rows: %s", exc)
        if mode == "docker_exec":
            log.error("Ensure Docker is running and container '%s' exists (docker ps).", container)
        sys.exit(1)
    log.info("  %d eligible rows in crawlerdb.cyprus.", total_eligible)

    # ── Connect to Mindlex DB ──────────────────────────────────────────────────
    log.info("Connecting to Mindlex DB at %s:%s/%s ...",
             os.getenv("MINDLEX_DB_HOST", "localhost"),
             os.getenv("MINDLEX_DB_PORT", "55432"),
             os.getenv("MINDLEX_DB_NAME", "mylaw"))
    try:
        mindlex = _mindlex_connect()
    except Exception as exc:
        log.error("Cannot connect to Mindlex DB: %s", exc)
        log.error("Start with: docker compose up -d postgres  (host port 55432)")
        sys.exit(1)

    # ── Load skip set ──────────────────────────────────────────────────────────
    try:
        embedded_ids = _load_embedded_ids(mindlex)
    except Exception as exc:
        log.error("Failed to query LegalDocuments: %s", exc)
        log.error("Run: dotnet ef database update --context MyLawDbContext")
        sys.exit(1)
    log.info("  %d records already embedded (will skip).", len(embedded_ids))

    # ── Stream + embed + insert ────────────────────────────────────────────────
    if mode == "direct":
        row_iter = _stream_direct(args.batch_size, args.limit, args.offset)
    else:
        row_iter = _stream_exec(container, args.limit, args.offset)

    estimate = min(args.limit, total_eligible) if args.limit > 0 else total_eligible
    processed = skipped = failed = 0
    batch: list = []
    t_start = time.monotonic()

    def _flush(b: list):
        texts = [_build_text(r) for r in b]
        embs = model.encode(texts, batch_size=32, show_progress_bar=False)
        _upsert_batch(mindlex, b, embs)
        return len(b)

    with tqdm(total=estimate, unit="rec", desc="Embedding", dynamic_ncols=True) as pbar:
        for row in row_iter:
            pbar.update(1)

            if row["id"] in embedded_ids:
                skipped += 1
                continue

            batch.append(row)

            if len(batch) < args.batch_size:
                continue

            try:
                processed += _flush(batch)
            except Exception as exc:
                log.error("Batch failed (IDs %d–%d): %s", batch[0]["id"], batch[-1]["id"], exc)
                failed += len(batch)
            finally:
                batch.clear()

            elapsed = time.monotonic() - t_start
            pbar.set_postfix(
                proc=processed, skip=skipped, fail=failed,
                rate=f"{processed / max(elapsed, 1):.1f}/s",
            )

        # Final partial batch
        if batch:
            try:
                processed += _flush(batch)
            except Exception as exc:
                log.error("Final batch failed: %s", exc)
                failed += len(batch)

    mindlex.close()

    elapsed = time.monotonic() - t_start
    log.info("=" * 60)
    log.info("Processed : %d", processed)
    log.info("Skipped   : %d  (already embedded)", skipped)
    log.info("Failed    : %d", failed)
    log.info("Elapsed   : %.1f s  |  Rate: %.1f rec/s", elapsed, processed / max(elapsed, 1))
    log.info("=" * 60)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
