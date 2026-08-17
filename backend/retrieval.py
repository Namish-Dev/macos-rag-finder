import nltk 
import re
import string
from database import conn, cursor

FALLBACK_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "did", "do",
    "does", "for", "from", "has", "have", "how", "i", "in", "is", "it",
    "me", "my", "of", "on", "or", "show", "tell", "that", "the", "there",
    "this", "to", "was", "what", "when", "where", "which", "who", "why",
    "with", "you"
}


def _stop_words():
    try:
        return set(nltk.corpus.stopwords.words('english'))
    except LookupError:
        return FALLBACK_STOP_WORDS


def extract_keywords(query):
    keywords = []
    query = query.lower().translate(
    # str.maketrans() creates a translation table that tells translate()
    # how to replace, remove, or map characters from one form to another.
    #The first two arguments are if you want to replace characters with other characters, and the third argument is if you want to remove characters.
    # Here it's used to remove all punctuation characters from a string.
    str.maketrans("", "", string.punctuation)
)
    words=query.split()
    stop_words=_stop_words()


    for word in words:
        if word not in keywords and word not in stop_words:
            keywords.append(word)

    return keywords

def keyword_search(query, limit=5, folder_id=None):
    keywords = extract_keywords(query)
    results_by_chunk_id = {}

    for keyword in keywords:
        like = f"%{keyword.lower()}%"
        params = [like, like, like, like]
        folder_clause = ""

        if folder_id is not None:
            folder_clause = "AND f.folder_id = ?"
            params.append(folder_id)

        params.append(limit)

        cursor.execute(
            f"""
            SELECT c.id, c.file_id, f.folder_id, c.chunk_index, c.title, c.chunk_text, c.keywords, c.section
            FROM chunks c
            JOIN files f ON f.id = c.file_id
            WHERE (
                LOWER(section) LIKE ?
                OR LOWER(title) LIKE ?
                OR LOWER(keywords) LIKE ?
                OR LOWER(chunk_text) LIKE ?
            )
            {folder_clause}
            ORDER BY
                CASE
                    WHEN LOWER(section) = ? THEN 0
                    WHEN LOWER(title) LIKE ? THEN 1
                    WHEN LOWER(keywords) LIKE ? THEN 2
                    ELSE 3
                END,
                c.file_id,
                c.chunk_index
            LIMIT ?
            """,
            tuple(params[:-1] + [keyword.lower(), like, like, params[-1]])
        )

        rows = cursor.fetchall()

        for row in rows:

            chunk_id, file_id, row_folder_id, chunk_index, title, chunk_text, keywords, section = row

            result = {
                "chunk_id": chunk_id,
                "file_id": file_id,
                "folder_id": row_folder_id,
                "chunk_index": chunk_index,
                "title": title,
                "chunk_text": chunk_text,
                "keywords": keywords,
                "section": section,
                "score": 0.0,
                "retrieval_sources": {"keyword"}
            }

            results_by_chunk_id[chunk_id] = result

    return list(results_by_chunk_id.values())

def hybrid_merged(vector_results, keyword_results):
    merged_results = {}

    for result in vector_results:
        result.setdefault("retrieval_sources", set()).add("vector")
        merged_results[result["chunk_id"]] = result

    for result in keyword_results:
        chunk_id = result["chunk_id"]

        if chunk_id in merged_results:
            merged_results[chunk_id].setdefault("retrieval_sources", set()).add("keyword")

            for key in ["file_id", "folder_id", "chunk_index", "title", "chunk_text", "keywords", "section"]:
                if not merged_results[chunk_id].get(key) and result.get(key):
                    merged_results[chunk_id][key] = result[key]

            continue

        merged_results[chunk_id] = result

    return list(merged_results.values())
