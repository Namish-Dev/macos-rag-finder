from qdrant_client import QdrantClient
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, VectorParams
from qdrant_client.models import PointStruct

client = QdrantClient(path="qdrant_data")

if not client.collection_exists("notes"):
    client.create_collection(
    collection_name="notes",
    vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    )

def _folder_filter(folder_id):
    if folder_id is None:
        return None

    return Filter(
        must=[
            FieldCondition(
                key="folder_id",
                match=MatchValue(value=folder_id)
            )
        ]
    )


def save_vector(chunk_id, embedding, payload):

    point = PointStruct(
        id=chunk_id,
        vector=embedding,
        payload=payload
    )

    client.upsert(
        collection_name="notes",
        points=[point]
    )

points, _ = client.scroll(
    collection_name="notes",
    limit=100
)

def search_vector(embedding, top_k=15, folder_id=None):

    search_result = client.query_points(
        collection_name="notes",
        query=embedding,
        query_filter=_folder_filter(folder_id),
        limit=top_k
    )

    results = []

    for point in search_result.points:

        result = {
            "chunk_id": point.id,
            "file_id": point.payload.get("file_id"),
            "folder_id": point.payload.get("folder_id"),
            "chunk_index": point.payload["chunk_index"],
            "title": point.payload["title"],
            "chunk_text": point.payload["chunk_text"],
            "keywords": point.payload.get("keywords", ""),
            "section": point.payload["section"],
            "score": point.score
        }

        results.append(result)

    return results


def delete_vectors_for_folder(folder_id):
    client.delete(
        collection_name="notes",
        points_selector=_folder_filter(folder_id)
    )
