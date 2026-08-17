from sentence_transformers import SentenceTransformer
# from sentence_transformers import CrossEncoder
from cohere_client import cohere_client
import re

# reranker = CrossEncoder("BAAI/bge-reranker-base")

model=SentenceTransformer('BAAI/bge-small-en-v1.5')

def generate_embedding(text:str):
    embedding=model.encode(text , normalize_embeddings=True)
    return embedding.tolist()

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "did", "do",
    "does", "for", "from", "has", "have", "how", "i", "in", "is", "it",
    "me", "my", "of", "on", "or", "show", "tell", "that", "the", "there",
    "this", "to", "was", "what", "when", "where", "which", "who", "why",
    "with", "you"
}


def _normalize_token(token):
    token = token.lower()

    if len(token) > 3 and token.endswith("s"):
        token = token[:-1]

    return token


def _tokens(text):
    words = re.findall(r"[a-zA-Z0-9]+", text.lower())
    return {
        _normalize_token(word)
        for word in words
        if word not in STOP_WORDS
    }


def build_retrieval_text(result):
    keywords = result.get("keywords", "")

    if isinstance(keywords, list):
        keywords = ", ".join(keywords)

    return f"""
Section: {result.get("section", "")}
Title: {result.get("title", "")}
Keywords: {keywords}
Content:
{result.get("chunk_text", "")}
""".strip()


def metadata_relevance_score(question, result):
    query_terms = _tokens(question)

    if not query_terms:
        return 0.0

    section_terms = _tokens(result.get("section", ""))
    title_terms = _tokens(result.get("title", ""))
    keyword_terms = _tokens(str(result.get("keywords", "")))
    body_terms = _tokens(result.get("chunk_text", ""))

    score = 0.0
    score += 2.0 * len(query_terms & section_terms)
    score += 1.25 * len(query_terms & title_terms)
    score += 1.0 * len(query_terms & keyword_terms)
    score += 0.10 * len(query_terms & body_terms)

    return score


def rerank(question, merged_results):

    if not merged_results:
        return merged_results

    # Step 1: Build the document texts (same as before)
    documents = [build_retrieval_text(result) for result in merged_results]

    # Step 2: Call Cohere's rerank endpoint ONCE
    response = cohere_client.rerank(
        model="rerank-v3.5",
        query=question,
        documents=documents,
    )

    # Step 3: Attach the scores, using each result's original index
    for item in response.results:
        i = item.index
        metadata_score = metadata_relevance_score(question, merged_results[i])
        vector_score = float(merged_results[i].get("score", 0.0) or 0.0)

        merged_results[i]["cross_encoder_score"] = float(item.relevance_score)
        merged_results[i]["metadata_score"] = metadata_score
        merged_results[i]["rerank_score"] = float(item.relevance_score) + metadata_score + (0.05 * vector_score)

    # Step 4: Sort (same as before)
    merged_results.sort(
        key=lambda x: x["rerank_score"],
        reverse=True
    )

    return merged_results
    
