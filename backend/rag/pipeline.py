import os
from typing import Any
from rag.regulations import REGULATION_DOCUMENTS

CHROMA_AVAILABLE = False
try:
    import chromadb
    from chromadb.config import Settings
    CHROMA_AVAILABLE = True
except ImportError:
    pass


class RagPipeline:
    def __init__(self, persist_dir: str = "chroma_db"):
        self.collection = None
        self.persist_dir = persist_dir
        self._init_chroma()

    def _init_chroma(self):
        if not CHROMA_AVAILABLE:
            print("[RAG] chromadb not installed — using fallback keyword search")
            return

        os.makedirs(self.persist_dir, exist_ok=True)
        client = chromadb.PersistentClient(
            path=self.persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )

        collection_name = "fraud_sentinel_regulations"
        try:
            self.collection = client.get_collection(collection_name)
            count = self.collection.count()
            if count > 0:
                print(f"[RAG] Loaded existing collection with {count} chunks")
                return
        except ValueError:
            pass

        self.collection = client.create_collection(
            collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        self._seed_documents()

    def _seed_documents(self):
        if not self.collection:
            return

        chunk_id = 0
        for doc in REGULATION_DOCUMENTS:
            paragraphs = [p.strip() for p in doc["content"].split("\n\n") if p.strip()]
            for i, para in enumerate(paragraphs):
                if len(para) < 20:
                    continue
                self.collection.add(
                    ids=[f"{doc['id']}_chunk_{i}"],
                    documents=[para],
                    metadatas=[{
                        "doc_id": doc["id"],
                        "title": doc["title"],
                        "source": doc["source"],
                        "chunk_index": i,
                    }],
                )
                chunk_id += 1

        print(f"[RAG] Seeded {chunk_id} chunks from {len(REGULATION_DOCUMENTS)} documents")

    def search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        if self.collection:
            try:
                results = self.collection.query(
                    query_texts=[query],
                    n_results=limit,
                )
                documents = results.get("documents", [[]])[0]
                metadatas = results.get("metadatas", [[]])[0]
                distances = results.get("distances", [[]])[0]

                output = []
                for doc, meta, dist in zip(documents, metadatas, distances):
                    score = max(0, 1 - dist)
                    output.append({
                        "docId": meta["doc_id"],
                        "title": meta["title"],
                        "source": meta["source"],
                        "relevanceScore": round(score, 4),
                        "excerpt": doc[:500] + ("..." if len(doc) > 500 else ""),
                    })
                return output
            except Exception as e:
                print(f"[RAG] Chroma query error: {e}")
                return self._fallback_search(query, limit)
        return self._fallback_search(query, limit)

    def _fallback_search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        terms = query.lower().split()
        scored: list[tuple[dict[str, Any], float]] = []

        for doc in REGULATION_DOCUMENTS:
            paragraphs = [p.strip() for p in doc["content"].split("\n\n") if p.strip()]
            content_lower = doc["content"].lower()
            title_lower = doc["title"].lower()

            base_score = sum(1 for t in terms if t in title_lower) * 3
            base_score += sum(1 for t in terms if t in content_lower)

            for i, para in enumerate(paragraphs):
                para_lower = para.lower()
                para_score = base_score + sum(1 for t in terms if t in para_lower) * 2
                if para_score > 0:
                    scored.append(({
                        "docId": doc["id"],
                        "title": doc["title"],
                        "source": doc["source"],
                        "relevanceScore": para_score,
                        "excerpt": para[:500] + ("..." if len(para) > 500 else ""),
                    }, para_score))

        scored.sort(key=lambda x: -x[1])
        return [item[0] for item in scored[:limit]]
