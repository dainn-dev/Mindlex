"""
One-shot fixer: convert literal "\\uXXXX" escape sequences inside FE source
files into actual Unicode characters. Needed because some files were written
via Python heredoc where a forgotten backslash-doubling left the escape as
6 visible chars in JSX text (which JSX does NOT decode, unlike JS string
literals).

Run from frontend/:
    python3 fix_escapes.py
"""
import os
import re

# Each KEY is the 6-char literal "\\uXXXX" string that may appear in the file.
# Each VALUE is the actual single Unicode character it should become.
ESCAPES = {
    "\\u2013": "–",  # en dash –
    "\\u2014": "—",  # em dash —
    "\\u2026": "…",  # ellipsis …
    "\\u2212": "−",  # minus −
    "\\u2190": "←",  # ← left arrow
    "\\u2192": "→",  # → right arrow
    "\\u2713": "✓",  # ✓ check
    "\\u25cf": "●",  # ● bullet
    "\\u00a9": "©",  # © copyright
    "\\u00a3": "£",  # £ pound
    "\\u00b7": "·",  # · middle dot
    "\\u20ac": "€",  # € euro
    "\\u2605": "★",  # ★ star
    "\\u201c": "“",  # “ left dquote
    "\\u201d": "”",  # ” right dquote
    "\\u2018": "‘",  # ' left squote
    "\\u2019": "’",  # ' right squote
}

# Surrogate pair (e.g. emoji) like "\\ud83d\\udcf0" → single char.
SURROGATE_RE = re.compile(r"\\u(d[89ab][0-9a-f]{2})\\u(d[c-f][0-9a-f]{2})", re.IGNORECASE)


def fix(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        original = f.read()
    updated = original
    n = 0
    for k, v in ESCAPES.items():
        if k in updated:
            n += updated.count(k)
            updated = updated.replace(k, v)

    def _sur(m: "re.Match[str]") -> str:
        hi = int(m.group(1), 16)
        lo = int(m.group(2), 16)
        cp = 0x10000 + (hi - 0xD800) * 0x400 + (lo - 0xDC00)
        return chr(cp)

    new = SURROGATE_RE.sub(_sur, updated)
    if new != updated:
        n += updated.count("\\u") // 2  # rough estimate
        updated = new

    if updated != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(updated)
        return n
    return 0


if __name__ == "__main__":
    total_files = 0
    total_replacements = 0
    for dirpath, _, files in os.walk("src"):
        for fn in files:
            if not fn.endswith((".ts", ".tsx", ".css", ".json")):
                continue
            p = os.path.join(dirpath, fn)
            n = fix(p)
            if n > 0:
                total_files += 1
                total_replacements += n
                print(f"  fixed {n:>3} escapes in {p}")
    print(f"---\nTotal: {total_replacements} replacements across {total_files} files")
