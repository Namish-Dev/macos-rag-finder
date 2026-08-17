from embedding import rerank

fake_results = [
    {
        "chunk_id": 1,
        "section": "PROJECTS",
        "title": "Flight Price Prediction",
        "keywords": ["python", "regression", "flights"],
        "chunk_text": "Trained a Random Forest model to predict flight prices using scikit-learn.",
        "score": 0.42,
    },
    {
        "chunk_id": 2,
        "section": "INTERNSHIP EXPERIENCE",
        "title": "Applied AI Intern",
        "keywords": ["rag", "chatbot", "policy"],
        "chunk_text": "Built a policy assistant chatbot using Retrieval-Augmented Generation.",
        "score": 0.55,
    },
    {
        "chunk_id": 3,
        "section": "PROJECTS",
        "title": "Face Recognition System",
        "keywords": ["opencv", "sqlite", "face recognition"],
        "chunk_text": "Built a real-time face capture and recognition pipeline using OpenCV.",
        "score": 0.38,
    },
]

question = "What are the projects?"

results = rerank(question, fake_results)

for i, r in enumerate(results, start=1):
    print("=" * 40)
    print(f"Rank {i}")
    print(f"Title: {r['title']}")
    print(f"Section: {r['section']}")
    print(f"Rerank Score: {r['rerank_score']:.4f}")
    print(f"CrossEncoder(Cohere) Score: {r['cross_encoder_score']:.4f}")
    print(f"Metadata Score: {r['metadata_score']:.4f}")