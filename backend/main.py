from fastapi import FastAPI, HTTPException, Header, Depends, UploadFile, File
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import jwt
from datetime import datetime, timedelta, timezone
from database import cursor, conn
from vector import delete_vectors_for_folder, save_vector
from document_analyzer import get_file_type
from extractor import extract_text
from chunking.semantic_chunker import create_semantic_chunk


import chat_store
from rag import contextualize_question, answer_question
from vector import search_vector
from retrieval import keyword_search, hybrid_merged
import time
from embedding import generate_embedding, rerank, build_retrieval_text

from fastapi.middleware.cors import CORSMiddleware

load_dotenv()



app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Hello, world"}

class LoginRequest(BaseModel):
    password: str

class CreateFolderRequest(BaseModel):
    title: str

class AskRequest(BaseModel):
    folder_id: int
    session_id: int
    question: str

def create_token():
    payload = {
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET"), algorithm="HS256")

@app.post("/login")
def login(payload: LoginRequest):
    if payload.password != os.getenv("ACCESS_PASSWORD"):
        raise HTTPException(status_code=401, detail="Incorrect password")

    token = create_token()
    return {"token": token}

def verify_token(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")

    try:
        jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@app.get("/protected")
def protected_route(authorized: None = Depends(verify_token)):
    return {"message": "You have access!"}


@app.get("/folders")
def list_folders(authorized: None = Depends(verify_token)):
    cursor.execute("SELECT id, title FROM folders ORDER BY title")
    rows = cursor.fetchall()

    return [{"id": row[0], "title": row[1]} for row in rows]

@app.post("/folders")
def create_folder(folder:CreateFolderRequest , authorized : None =Depends(verify_token)):
    cursor.execute("INSERT INTO folders (title) VALUES (?)",(folder.title,))
    conn.commit()
    return {"message":"Folder created successfully"}

# @app.delete("/folders/{folder_id}")
# def delete_folder(folder_id: int, authorized: None = Depends(verify_token)):
#     cursor.execute("SELECT id FROM folders WHERE id = ?", (folder_id,))
#     existing = cursor.fetchone()

#     if existing is None:
#         raise HTTPException(status_code=404, detail="Folder not found")

#     delete_vectors_for_folder(folder_id)

#     cursor.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
#     conn.commit()
#     return {"message": "Folder deleted successfully"}

@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, authorized: None = Depends(verify_token)):
    cursor.execute("SELECT id FROM folders WHERE id = ?", (folder_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Folder not found")

    delete_vectors_for_folder(folder_id)

    cursor.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    conn.commit()

    return {"message": "Folder deleted successfully"}


@app.delete("/files/{file_id}")
def delete_file(file_id: int, authorized: None = Depends(verify_token)):
    cursor.execute("SELECT id FROM files WHERE id = ?", (file_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="File not found")

    cursor.execute("DELETE FROM files WHERE id = ?", (file_id,))
    conn.commit()

    return {"message": "File deleted successfully"}

@app.post("/folders/{folder_id}/upload")
async def upload_file(
    folder_id: int,
    file: UploadFile = File(...),
    authorized: None = Depends(verify_token)
):
    file_bytes = await file.read()
    mime_type = file.content_type
    file_type = get_file_type(file.filename)

    response = extract_text(file_bytes, mime_type, file_type)

    cursor.execute(
        "INSERT INTO files(folder_id, file_name, content) VALUES (?, ?, ?)",
        (folder_id, file.filename, response)
    )
    file_id = cursor.lastrowid

    chunks = create_semantic_chunk(response)

    for chunk_data in chunks:
        text_for_embedding = f"""
        Section: {chunk_data["section"]}
        Title: {chunk_data["title"]}
        Keywords: {", ".join(chunk_data["keywords"])}
        Content:
        {chunk_data["chunk_text"]}
        """

        embedding = generate_embedding(text_for_embedding)

        cursor.execute(
            """
            INSERT INTO chunks (file_id, section, chunk_index, title, chunk_text, keywords)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (file_id, chunk_data["section"], chunk_data["chunk_index"],
             chunk_data["title"], chunk_data["chunk_text"], ",".join(chunk_data["keywords"]))
        )
        chunk_id = cursor.lastrowid

        payload = {
            "folder_id": folder_id,
            "file_id": file_id,
            "section": chunk_data["section"],
            "chunk_index": chunk_data["chunk_index"],
            "title": chunk_data["title"],
            "chunk_text": chunk_data["chunk_text"],
            "keywords": chunk_data["keywords"],
        }

        save_vector(chunk_id=chunk_id, embedding=embedding, payload=payload)

    conn.commit()

    return {"file_id": file_id, "file_name": file.filename, "chunks_created": len(chunks)}

@app.get("/folders/{folder_id}/files")
def list_files(folder_id: int, authorized: None = Depends(verify_token)):
    cursor.execute(
        """
        SELECT id, file_name, content, created_at
        FROM files
        WHERE folder_id = ?
        ORDER BY created_at DESC
        """,
        (folder_id,)
    )
    rows = cursor.fetchall()

    return [
        {"id": row[0], "file_name": row[1], "content": row[2], "created_at": row[3]}
        for row in rows
    ]

@app.get("/folders/{folder_id}/sessions")
def list_sessions(folder_id: int, authorized: None = Depends(verify_token)):
    sessions = chat_store.get_sessions(folder_id)
    return [
        {"id": s[0], "title": s[1], "created_at": s[2]}
        for s in sessions
    ]

@app.post("/folders/{folder_id}/sessions")
def create_new_session(folder_id: int, authorized: None = Depends(verify_token)):
    session_id = chat_store.create_session(folder_id)
    return {"id": session_id}

@app.get("/sessions/{session_id}/messages")
def list_messages(session_id: int, authorized: None = Depends(verify_token)):
    return chat_store.get_messages(session_id)

@app.post("/ask")
def ask_question(payload: AskRequest, authorized: None = Depends(verify_token)):
    recent_history = chat_store.get_messages(payload.session_id, limit=8)

    t0 = time.time()
    standalone_question = contextualize_question(payload.question, recent_history)
    print(f"contextualize_question took {time.time() - t0:.2f}s")

    t0 = time.time()
    question_embedding = generate_embedding(standalone_question)
    print(f"generate_embedding took {time.time() - t0:.2f}s")

    t0 = time.time()
    vector_results = search_vector(question_embedding, top_k=20, folder_id=payload.folder_id)
    keyword_results = keyword_search(payload.question, limit=20, folder_id=payload.folder_id)
    merged_results = hybrid_merged(vector_results, keyword_results)
    print(f"retrieval + merge took {time.time() - t0:.2f}s")

    t0 = time.time()
    reranked = rerank(standalone_question, merged_results)
    print(f"rerank took {time.time() - t0:.2f}s")

    top_chunks = reranked[:5]

    context = ""
    for i, result in enumerate(top_chunks, start=1):
        context += f"""
Chunk {i}

{build_retrieval_text(result)}

--------------------------------
"""

        rag_prompt = f"""You are an AI assistant that answers questions using the provided notes.

=========================
Retrieved Notes
=========================

{context}

=========================
Question
=========================

{payload.question}

=========================
Rules
=========================

1. Answer only from the notes.
2. If the answer isn't available, say so.
3. Don't hallucinate.
4. Be concise.
5. Include code when useful.
"""

    # t0 = time.time()
    # answer = answer_question(rag_prompt)
    # print(f"answer_question took {time.time() - t0:.2f}s")

    # return {
    #     "answer": answer,
    #     "standalone_question": standalone_question,
    #     "top_chunks": [
    #         {"title": r.get("title"), "section": r.get("section"), "rerank_score": r.get("rerank_score")}
    #         for r in top_chunks
    #     ]
    # }

    t0 = time.time()
    answer = answer_question(rag_prompt)
    print(f"answer_question took {time.time() - t0:.2f}s")

    chat_store.save_message(payload.session_id, "user", payload.question)
    chat_store.save_message(payload.session_id, "assistant", answer)

    return {
        "answer": answer,
        "standalone_question": standalone_question,
        "top_chunks": [
            {"title": r.get("title"), "section": r.get("section"), "rerank_score": r.get("rerank_score")}
            for r in top_chunks
        ]
    }