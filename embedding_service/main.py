import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")  # force CPU — no GPU required

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()
model = SentenceTransformer("intfloat/multilingual-e5-small")


class EmbedRequest(BaseModel):
    text: str


@app.post("/embed")
def embed(req: EmbedRequest):
    # e5 models require "query: " prefix for queries; documents were embedded with "passage: " prefix
    text = "query: " + req.text[:2000]
    emb = model.encode(text, normalize_embeddings=True)
    return {"embedding": emb.tolist()}


@app.get("/health")
def health():
    return {"status": "ok"}
