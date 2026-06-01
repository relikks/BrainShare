from google import genai
from google.genai import types

from .config import settings

_client = genai.Client(api_key=settings.google_api_key)


async def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed a batch of chunk texts for storage (RETRIEVAL_DOCUMENT)."""
    if not texts:
        return []
    res = await _client.aio.models.embed_content(
        model=settings.embedding_model,
        contents=texts,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=settings.embedding_dim,
        ),
    )
    return [e.values for e in res.embeddings]


async def embed_query(text: str) -> list[float]:
    """Embed a single query (RETRIEVAL_QUERY)."""
    res = await _client.aio.models.embed_content(
        model=settings.embedding_model,
        contents=[text],
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=settings.embedding_dim,
        ),
    )
    return res.embeddings[0].values
