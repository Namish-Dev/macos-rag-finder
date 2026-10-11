# macos-rag-finder

**Chat with your own notes.** Upload PDFs, images of handwritten notes, or text files into folders, then ask questions in plain English. The app finds the relevant parts of *your* notes and answers using only them.

It looks like a macOS Finder window (folders, files, double-click to open) with a floating chat bubble, like the support chat on a shopping website.

> Want to understand *why* it is built this way, or rebuild something like it yourself?
> Read [`explanation.md`](./explanation.md). It explains every piece in plain language.

---

## What it can do

- **Folders and files**: create folders, upload files into them, preview them, delete them.
- **Upload many files at once**: browse your computer or drag and drop. Files are processed one at a time with a progress indicator.
- **Reads many kinds of notes**: text PDFs, scanned PDFs, photos of handwritten notes (`.jpg`, `.jpeg`, `.png`), `.txt` and `.md`.
- **Chat per folder**: a floating chat widget that can be switched to a sidebar.
- **Chat history**: create, switch between and delete chat sessions inside each folder.
- **Follow-up questions work**: "what is pip?" then "does it come pre-installed?" is understood correctly.
- **Nice answers**: Markdown, code blocks and math formulas (LaTeX) are rendered properly.
- **Password login**: one password protects the whole app.

## How it works (the short version)

This pattern is called **RAG: Retrieval-Augmented Generation**. Instead of asking an AI to answer from memory, the app first *looks up* the right pieces of your notes and hands them to the AI together with your question.

```
UPLOAD
  file ─► extract text ─► split into chunks ─► turn chunks into "meaning numbers"
                                                    │
                                   ┌────────────────┴───────────────┐
                                   ▼                                ▼
                         SQLite (the text)               Qdrant (the numbers)

ASK
  question ─► rewrite as standalone ─► vector search ┐
                (uses chat history)    keyword search ┴─► merge ─► rerank ─► top 5 chunks
                                                                                │
                                          answer (Gemini) ◄── prompt with rules ◄┘
                                               │
                                               └─► saved to chat history ─► shown in the widget
```

## Tech stack

| Layer           | Technology                                            | What it does here                                |
| --------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Frontend        | React 19 + Vite                                       | The Finder-style UI and chat widget              |
| Rendering       | react-markdown, remark-gfm, remark-math, rehype-katex | Shows Markdown, tables and formulas              |
| Backend         | FastAPI + Uvicorn                                     | The API the frontend talks to                    |
| Auth            | PyJWT                                                 | Login token, valid 7 days                        |
| Database        | SQLite                                                | Folders, files, chunks, chat sessions, messages  |
| Vector database | Qdrant (embedded, local folder)                       | Stores embeddings and finds similar ones         |
| Embeddings      | `BAAI/bge-small-en-v1.5` (sentence-transformers)    | Turns text into 384 numbers                      |
| Reranking       | Cohere Rerank (`rerank-v3.5`)                       | Re-sorts search results by true relevance        |
| LLM             | Gemini 2.5 Flash, OpenRouter as fallback              | Reads images, rewrites questions, writes answers |
| PDF reading     | PyMuPDF + pymupdf4llm                                 | PDF to Markdown, no AI needed                    |

## Project structure

```
macos-rag-finder/
├── backend/
│   ├── main.py               # All API routes + the /ask pipeline
│   ├── database.py           # SQLite connection and table creation
│   ├── extractor.py          # File -> Markdown text (PDF, image, txt, md)
│   ├── document_analyzer.py  # Works out the file type from the file name
│   ├── chunking/
│   │   └── semantic_chunker.py   # Splits text into chunks (no AI, runs locally)
│   ├── embedding.py          # Embeddings + reranking + metadata scoring
│   ├── vector.py             # Everything that talks to Qdrant
│   ├── retrieval.py          # Keyword search + merging vector and keyword results
│   ├── rag.py                # Rewrites follow-up questions + generates answers
│   ├── chat_store.py         # Chat sessions and messages (SQL)
│   ├── gemini_client.py      # Gemini connection
│   ├── openrouter_client.py  # OpenRouter connection (fallback)
│   ├── cohere_client.py      # Cohere connection
│   └── requirements.txt
├── src/
│   ├── App.jsx               # Main Finder window, folders, files, uploads
│   ├── ChatWidget.jsx        # Floating chat, sessions, sidebar mode
│   ├── FilePreviewPage.jsx   # Full-page Markdown preview of a file
│   ├── LoginScreen.jsx       # Password screen
│   ├── api.js                # fetch() wrapper that adds the login token
│   └── index.css, App.css    # Styling
├── package.json
└── README.md
```

## Getting started

You need **Python 3.10+**, **Node.js 20+** and API keys for Gemini, OpenRouter and Cohere (all have free tiers).

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate        macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
ACCESS_PASSWORD=choose-a-password
JWT_SECRET=any-long-random-string
Gemini_API_KEY=your-gemini-key
OpenRouter_API_KEY=your-openrouter-key
Cohere_API_KEY=your-cohere-key
```

Start it (run this *from inside* `backend/`):

```bash
uvicorn main:app --reload
```

The first start downloads the embedding model, so it takes a while. `notes.db` and the `qdrant_data/` folder are created automatically.

### 2. Frontend

In a second terminal, from the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), log in with your `ACCESS_PASSWORD`, create a folder, upload a file, and click the chat bubble.

> The backend allows requests only from `http://localhost:5173` (see CORS in `backend/main.py`), and the backend address `http://127.0.0.1:8000` is written in `src/api.js` and `src/LoginScreen.jsx`. Change both places if you use different ports.

## API overview

All routes except `/login` need the header `Authorization: Bearer <token>`.

| Method     | Route                       | Purpose                                                |
| ---------- | --------------------------- | ------------------------------------------------------ |
| POST       | `/login`                  | Password in, token out                                 |
| GET / POST | `/folders`                | List / create folders                                  |
| DELETE     | `/folders/{id}`           | Delete a folder (files, chunks, chats and its vectors) |
| GET        | `/folders/{id}/files`     | List files in a folder                                 |
| POST       | `/folders/{id}/upload`    | Upload a file: extract, chunk, embed, store            |
| DELETE     | `/files/{id}`             | Delete a file                                          |
| GET / POST | `/folders/{id}/sessions`  | List / create chat sessions                            |
| DELETE     | `/sessions/{id}`          | Delete a chat session and its messages                 |
| GET        | `/sessions/{id}/messages` | Chat history of a session                              |
| POST       | `/ask`                    | Ask a question (the full RAG pipeline)                 |

Quick test of the login route (Windows `cmd.exe`):

```
curl.exe -X POST http://127.0.0.1:8000/login -H "Content-Type: application/json" -d "{\"password\":\"your-password\"}"
```

## Known limitations

Being honest :

- **Not deployed yet.** It runs locally. Measured on a Windows machine, the backend uses about **512 MB of RAM** once the embedding model is loaded, which is too much for Render's free 512 MB instances.Simply I don't have the resources to deploy and check so stopping it here for now
- **Deleting a single file does not delete its vectors from Qdrant.** The file disappears from the list, but its chunks can still be found by search and show up in answers. Deleting a whole *folder* does clean up its vectors. This is the first bug worth fixing.
- **Local storage only.** `notes.db` and `qdrant_data/` are local files. They would be lost on most free hosts.
- **`.docx` is not supported.** Supported: PDF, `.jpg`, `.jpeg`, `.png`, `.txt`, `.md`.
- **Single password, single user.** No accounts.Cause earlier the plan was to deply it and use it for my perosnal purpose but since deploying it out off option the single password is just like an extra feature
- **Answers take roughly 8-9 seconds** because two LLM calls (rewriting the question, writing the answer) plus a rerank call happen one after another.
- **No streaming**: the whole answer appears at once.
- **Debug `print()` timing lines** are still in `/ask`.

## Roadmap

1. Delete a file's vectors when the file is deleted.
2. Replace the local embedding model with a hosted embedding API so the backend fits in 512 MB (this means re-embedding everything once and changing the vector size in `vector.py`).
3. Move vectors to Qdrant Cloud and SQLite to Postgres (Supabase or Neon).
4. Deploy the backend (Render) and frontend (Vercel); move the API address into an environment variable; show a "waking up the server" message for cold starts.
5. Auto-title chat sessions from the first question.
6. Stream answers word by word.
7. Optional: `.docx` support with `python-docx`.

## History

The project started as a quick Streamlit script (upload a note, see Markdown) and grew step by step: database, chunking, embeddings, vector search, hybrid search, reranking, chat memory, and finally a proper FastAPI + React app. The full story is in [`explanation.md`](./explanation.md).
