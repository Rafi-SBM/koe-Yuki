"""Tiny dependency-free local RAG index for portfolio/demo knowledge.

Drop Markdown files into ``agent/knowledge``. At startup the index is loaded
into memory and retrieved with a lightweight TF-IDF-like token overlap score.
This keeps the free deployment path fast and avoids a database/vector service.
"""

from __future__ import annotations

import re
from pathlib import Path


class LocalKnowledgeBase:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.documents: list[tuple[str, str, set[str]]] = []
        self.reload()

    def reload(self) -> None:
        self.documents.clear()
        if not self.root.exists():
            return
        for path in sorted(self.root.rglob("*.md")):
            text = path.read_text(encoding="utf-8", errors="ignore")
            tokens = set(re.findall(r"[\w'-]{3,}", text.lower()))
            self.documents.append((str(path.relative_to(self.root)), text, tokens))

    def search(self, query: str, limit: int = 3) -> list[dict[str, str | float]]:
        query_tokens = set(re.findall(r"[\w'-]{3,}", query.lower()))
        scored = []
        for name, text, tokens in self.documents:
            score = len(query_tokens & tokens) / max(1, len(query_tokens))
            if score:
                scored.append((score, name, text[:1200]))
        scored.sort(reverse=True)
        return [{"source": name, "score": round(score, 3), "content": content} for score, name, content in scored[:limit]]
