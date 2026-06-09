"""Embedding pipeline entry point. Full extractors land in task P2 (see pipeline.py).

For now `process_file` is imported by the files router; the real implementation
(extract → embed → upsert across spaces) replaces this in the same module path.
"""

from .runner import process_file

__all__ = ["process_file"]
