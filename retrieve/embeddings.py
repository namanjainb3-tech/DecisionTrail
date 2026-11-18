from __future__ import annotations

import hashlib
import logging
from typing import Sequence
import numpy as np
from core.models import Decision

logger = logging.getLogger(__name__)

_model = None


def get_embedding_model():
    global _model
    if _model is None:
        try:
            import os
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
        except Exception as e:
            logger.info(f"SentenceTransformer local load: {e}. Trying fallback.")
            try:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer("all-MiniLM-L6-v2")
            except Exception as ex:
                logger.warning(f"Could not load SentenceTransformer model: {ex}. Using deterministic fallback.")
                _model = None
    return _model


def _fallback_deterministic_embedding(text: str, dim: int = 384) -> list[float]:
    """Generates a reproducible, normalized pseudo-semantic embedding based on sha256 chunks."""
    seed_hash = hashlib.sha256(text.encode("utf-8")).digest()
    np.random.seed(int.from_bytes(seed_hash[:4], "big"))
    vec = np.random.randn(dim).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


def embed_text(text: str) -> list[float]:
    model = get_embedding_model()
    if model is not None:
        try:
            embedding = model.encode(text, normalize_embeddings=True)
            return embedding.tolist()
        except Exception as e:
            logger.warning(f"Embedding encoding failed: {e}. Using fallback.")
    return _fallback_deterministic_embedding(text)


def embed_decision(decision: Decision) -> list[float]:
    parts = [f"Title: {decision.title}", f"Rationale: {decision.rationale}"]
    for alt in decision.alternatives:
        parts.append(f"Rejected: {alt.text}. Reason: {alt.reason}")
    combined_text = ". ".join(parts)
    return embed_text(combined_text)


def cosine_similarity(v1: Sequence[float], v2: Sequence[float]) -> float:
    a = np.array(v1, dtype=np.float32)
    b = np.array(v2, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
