# How macos-rag-finder Works: The Story

> This document is written for **future you**. You built this app step by step, hit real bugs, and fixed them. Everything you learned is here, told as a story, so you can build something like it again without asking anyone.
>
> You do not need to read it in one go. Each chapter stands alone: *the problem*, *the idea*, *a picture to hold in your head*, *a little code*, *the trap I fell into*, *the lesson*.

---

## Contents

0. [The one-paragraph version](#0-the-one-paragraph-version)
1. [The problem, and the open-book exam](#1-the-problem-and-the-open-book-exam)
2. [The map: a restaurant](#2-the-map-a-restaurant)
3. [Chapter 1: Getting text out of files](#3-chapter-1-getting-text-out-of-files)
4. [Chapter 2: A place to keep things (SQLite)](#4-chapter-2-a-place-to-keep-things-sqlite)
5. [Chapter 3: Chopping notes into chunks](#5-chapter-3-chopping-notes-into-chunks)
6. [Chapter 4: Turning meaning into numbers (embeddings)](#6-chapter-4-turning-meaning-into-numbers-embeddings)
7. [Chapter 5: The meaning-map database (Qdrant)](#7-chapter-5-the-meaning-map-database-qdrant)
8. [Chapter 6: Two kinds of search are better than one](#8-chapter-6-two-kinds-of-search-are-better-than-one)
9. [Chapter 7: The strict teacher (reranking)](#9-chapter-7-the-strict-teacher-reranking)
10. [Chapter 8: Asking the AI properly](#10-chapter-8-asking-the-ai-properly)
11. [Chapter 9: Giving the app a memory](#11-chapter-9-giving-the-app-a-memory)
12. [Chapter 10: From script to real app (FastAPI)](#12-chapter-10-from-script-to-real-app-fastapi)
13. [Chapter 11: The face (React)](#13-chapter-11-the-face-react)
14. [Chapter 12: The chat widget](#14-chapter-12-the-chat-widget)
15. [Chapter 13: Uploading, properly](#15-chapter-13-uploading-properly)
16. [Chapter 14: The deployment reality check](#16-chapter-14-the-deployment-reality-check)
17. [How to build your own, from scratch](#17-how-to-build-your-own-from-scratch)
18. [Habits that saved me](#18-habits-that-saved-me)
19. [Bug museum](#19-bug-museum)
20. [Glossary](#20-glossary)

---

## 0. The one-paragraph version

You upload notes. The app turns them into text, cuts the text into small pieces, and stores each piece twice: once as plain text (so people can read it) and once as a list of numbers that captures its *meaning* (so a computer can search by meaning). When you ask a question, the app finds the few pieces that best match, hands only those to an AI, and says: *"Answer using only this."* The answer and the question are saved so follow-up questions make sense.

That is the whole app. Everything else is making each step reliable.

---

## 1. The problem, and the open-book exam

You write notes. Later you want to ask: *"What was the formula for X?"* or *"How do I write an ordinal pipeline?"*

**Why not just paste everything into ChatGPT?**

- Notes can be hundreds of pages. There is a limit to how much you can hand an AI at once, and a cost for every word.
- If the AI does not have your notes, it answers from its own memory, and it can sound sure while being wrong.

**The idea: an open-book exam.**

- A normal chatbot is a student in a *closed-book* exam. It answers from memory and sometimes misremembers.
- Your app is a student in an *open-book* exam. Before answering, it flips to the right page in *your* notebook, reads it, and then answers. If the page does not say it, the student can honestly write *"not in the book."*

This pattern has a name: **RAG, Retrieval-Augmented Generation**.

- **Retrieval**: find the right pages.
- **Augmented**: add those pages to the question.
- **Generation**: the AI writes the answer.

Almost all of the work in this project is the **R**: finding the right pages. The AI writing the answer is one function call. If retrieval hands the AI the wrong pages, even the smartest AI gives a bad answer.

> **Remember this:** In RAG, the quality of the answer is mostly decided *before* the AI is called.

---

## 2. The map: a restaurant

Keep this picture in your head for the whole document.

| In the restaurant | In the app | Technology |
|---|---|---|
| Dining room (what customers see) | The Finder-style window and chat bubble | **React** |
| Waiter (carries orders between room and kitchen) | HTTP requests (`fetch`) | **fetch / `api.js`** |
| Kitchen (does the real work) | The server with all the logic | **FastAPI** |
| Pantry (ingredients, labelled shelves) | Folders, files, chunks, chats | **SQLite** |
| The special freezer (finds things by "taste") | Meaning-numbers for every chunk | **Qdrant** |
| The chef's assistant who reads recipes | Reads the notes and writes answers | **Gemini (an LLM)** |
| A strict food critic | Re-sorts the candidates | **Cohere Rerank** |
| Bouncer at the door | Password + login token | **JWT** |

**The journey of one question:**

```
You type a question in the chat bubble          (dining room)
  └─► the waiter (fetch) carries it to the kitchen   POST /ask
        └─► the kitchen:
              1. looks at the conversation so far
              2. rewrites your question so it makes sense alone
              3. asks the pantry (keyword search) and the freezer (meaning search)
              4. the critic re-sorts what they found
              5. the top 5 pieces go to the AI with strict instructions
              6. the answer is written down in the chat history
        └─► the waiter carries the answer back
You read it in the chat bubble
```

---

## 3. Chapter 1: Getting text out of files

### The problem
A photo of handwritten notes or a PDF is not text. A computer cannot search a picture.

### First attempt: OCR
**OCR** (Optical Character Recognition) is software that recognises letters. You tried several engines. The result: *good at letters, bad at understanding.* Words got split, code lost its indentation, headings looked like normal lines.

> **Picture:** OCR is a person who can read every word out loud perfectly but has no idea which line is a title and which is a sentence.

### The fix: a Vision Language Model (VLM)
Instead of "read the letters", you ask an AI that can *see*: "Look at this page and rewrite it as well-structured Markdown." Gemini does this and returns headings, bullet points and code blocks.

```python
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[Prompt, types.Part.from_bytes(data=file_bytes, mime_type=mime_type)],
)
return response.text
```

The prompt says things like *"Return ONLY the formatted notes. Do not invent information."* Prompts are instructions; the clearer they are, the less cleanup you do later.

### Don't use an expensive AI where a cheap tool works
A normal PDF already contains text. Sending it to a vision AI wastes money and time. So:

```
Image          ─► Gemini vision ─► Markdown
PDF with text  ─► PyMuPDF / pymupdf4llm ─► Markdown      (free, instant)
PDF scanned    ─► (no text found)  ─► Gemini vision ─► Markdown
.txt / .md     ─► just read the bytes as text
```

How does the code know a PDF is scanned? It tries to extract text. If nothing comes out, it must be pictures of pages, so it falls back to the vision AI.

### Why Markdown?
Markdown (`# Heading`, `- bullet`, `` ``` `` code) is plain text that still carries *structure*. That structure is what lets the next step (chunking) cut the notes in sensible places.

### A fallback for when the AI is down
Every AI call is wrapped like this:

```python
try:
    return answer_with_gemini(prompt)
except Exception:
    return answer_with_openrouter(prompt)
```

Free AI services have limits and bad days. A second provider keeps the app usable.

### Traps and lessons
- **The extractor was written for Streamlit's upload object** (`upload.getvalue()`, `upload.type`). When it moved to FastAPI, whose upload object is different, it broke. The fix: make the extractor accept *plain values* (`file_bytes`, `mime_type`), not a framework's special object. Then it does not care who calls it.
- **Unsupported types crashed silently.** `.docx` returned `None`, the database refused `None`, the server crashed with a 500, and the browser showed nothing. Lesson: **reject what you do not support, loudly and early** (`400 Unsupported file type`) and show the message to the user.

---

## 4. Chapter 2: A place to keep things (SQLite)

### The problem
You need to remember folders, files, pieces of text and chats, and link them together.

### The idea: design the database the way a person thinks
People think: *"I have folders. Inside are files. Each file has sections."* So:

```
folders ──► files ──► chunks
   └──────► chat_sessions ──► chat_messages
```

**SQLite** is a database that lives in one file (`notes.db`). No server to install. Perfect for learning and small apps.

### The key trick: `ON DELETE CASCADE`
```sql
FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
```
This says: *"If the folder is deleted, automatically delete everything that belongs to it."* One `DELETE FROM folders` removes its files, their chunks, its chats and their messages. You write no cleanup code.

> **Remember:** SQLite only enforces this if you turn it on: `PRAGMA foreign_keys = ON`.

### Parent first, then children
When you save a file and its chunks:

```python
cursor.execute("INSERT INTO files ...")
file_id = cursor.lastrowid          # the id the database just created
# every chunk now uses this file_id
conn.commit()                        # one commit = all-or-nothing
```

`lastrowid` is "what number did the database give the row I just added?" You need it to connect children to their parent. One `commit()` at the end means either everything is saved or nothing is.

### Always use `?` placeholders
```python
cursor.execute("SELECT * FROM chunks WHERE title LIKE ?", (f"%{word}%",))   # good
```
Never build SQL with f-strings. It is unsafe (SQL injection) and breaks with quotes in text.

### Traps and lessons
- **Confusing `folder_id` and `file_id`.** Chunks belong to *files*, not folders. Keep a clear picture of who is the parent of whom.
- **The same file saved many times** (in the Streamlit version). Streamlit re-runs the whole script on every click, so `if upload is not None:` re-saved the file each time. Fix: only act on an explicit "Submit".

---

## 5. Chapter 3: Chopping notes into chunks

### The problem
Imagine searching a 100-page book by asking one question. If your "pages" are whole chapters, each chapter mixes many topics, so a chapter is *sort of* about everything and *clearly* about nothing.

### The idea: small, single-topic pieces
A **chunk** is a small piece of text about one thing. Searching chunks is like searching index cards instead of whole books.

### The journey (three attempts)

| Attempt | How | Problem |
|---|---|---|
| 1 | Split on blank lines | Depends on spacing; unreliable |
| 2 | Split on `###` headings | Better, but one heading can still hold several topics; the AI sometimes wrote `##` or no headings, giving zero chunks |
| 3 | Ask an LLM to split by concept | Good quality, but costs money on every upload (a 100-page PDF is expensive) |
| **Final** | **A local, rule-based chunker** | Free, instant, predictable |

### How the final chunker thinks
It reads the Markdown line by line and follows a few rules:

1. A Markdown heading (`#`, `##`, `###`) starts a new section.
2. A line in **ALL CAPS** (like `PROJECTS` or `EDUCATION`) is also a section heading. This matters for resumes, which often have no `#` marks.
3. In "grouped" sections (`PROJECTS`, `EXPERIENCE`, `EDUCATION`, ...), each **bold item title** starts its own chunk, but the chunk remembers its parent section. So you get five chunks, all with `section = PROJECTS`.
4. A chunk never exceeds about 1800 characters. Longer ones are split at paragraph or sentence boundaries, with a small overlap (about 220 characters) so a sentence cut in half still has context on both sides.
5. Code blocks (fenced with three backticks) are never cut in the middle.
6. Keywords are picked locally by counting the most frequent non-boring words.

Each chunk becomes a small record:

```python
{
  "chunk_index": 3,
  "section": "PROJECTS",
  "title": "Research Agent",
  "chunk_text": "...",
  "keywords": ["langgraph", "agent", ...]
}
```

> **Why `section`, `title` and `keywords` matter:** they are *labels on the index card*. Later, the search can use them. The `PROJECTS` label alone fixed one of the nastiest bugs (Chapter 7).

### Lessons
- **If chunks are bad, everything after is bad.** When answers were poor, the culprit was big mixed chunks, not the database or the AI.
- **A local rule-based tool beat an AI tool** here: cheaper, faster, and the same result every time. Ask "can plain code do this?" before reaching for an AI.
- **"No chunks, no embeddings, no vectors, no answers."** One broken early step makes a later step look broken. When something is empty, trace backwards.

---

## 6. Chapter 4: Turning meaning into numbers (embeddings)

### The problem
You ask *"How do I fix a flat tyre?"* Your note says *"Repairing a punctured wheel."* No words match. A normal text search finds nothing.

### The idea: a map of meaning
An **embedding model** turns a piece of text into a long list of numbers. Think of those numbers as a **GPS coordinate on a giant map of meaning**:

- "puppy" and "dog" land close together.
- "dog" and "tax return" land far apart.
- *"fix a flat tyre"* and *"repairing a punctured wheel"* land next to each other, even with no shared words.

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-small-en-v1.5")

def generate_embedding(text):
    return model.encode(text, normalize_embeddings=True).tolist()
```

- This model returns **384 numbers** per text. That count is the model's choice. It is called the **dimension**, and it must match what the vector database expects.
- `normalize_embeddings=True` makes every vector the same length, so comparing them is fair.

### How "closeness" is measured: cosine similarity
Two coordinates are "close in meaning" if the arrows they point in are similar. That is **cosine similarity**: 1 means the same direction, 0 means unrelated. You do not compute this yourself; the vector database does.

### What exactly gets embedded?
Not just the chunk text. You embed a small bundle:

```
Section: PROJECTS
Title: Research Agent
Keywords: langgraph, agent, ...
Content:
<the chunk text>
```

So the label information becomes part of the "meaning".

### The same model for notes and questions
Notes and questions **must** be embedded by the same model, otherwise they live on different maps and distances mean nothing.

### Traps and lessons
- **Environment errors.** `ModuleNotFoundError: Could not import module 'PreTrainedModel'` came from incompatible global packages (and a very new Python). Fix: make a clean **virtual environment** with a compatible Python, and install into *that*.
- **"I installed it but it still says missing."** You installed into the wrong Python environment. Activate the right one first, install, then check with `python -c "import X; print(X.__file__)"`.
- **The model is big.** It loads PyTorch. When measured, the backend used about **512 MB of RAM**. See Chapter 14. This is why you test memory *before* choosing a host.

---

## 7. Chapter 5: The meaning-map database (Qdrant)

### The problem
You now have thousands of coordinate-lists. For a question, you need the 20 closest ones. SQLite is great at "find rows where the title contains X", but it is not built to compare thousands of 384-number lists quickly.

### The idea: a vector database
**Qdrant** is a database designed for exactly one job: *"which stored vectors are closest to this one?"*

Its vocabulary:

| Qdrant word | Plain meaning | SQL equivalent |
|---|---|---|
| Collection | A named set of vectors (`notes`) | A table |
| Point | One entry | A row |
| Vector | The 384 numbers | A special column |
| Payload | Extra info carried along (title, text, folder_id) | Other columns |

**The payload is never searched.** Qdrant compares vectors only. The payload is just baggage returned with each match, so you get a title and text back without another lookup.

### The load-bearing decision: reuse SQLite's chunk id
Every Qdrant point needs an id. You use the **SQLite `chunks.id`**:

```
SQLite chunk #243  ◄───same number───►  Qdrant point #243
```

Unique, automatic, and a direct bridge between the two databases. (The catch: if you ever wipe one database, wipe the other too, or the ids no longer line up.)

### Filtering by folder
Every point's payload carries `folder_id`, so a search can say "only look inside folder 2":

```python
Filter(must=[FieldCondition(key="folder_id", match=MatchValue(value=folder_id))])
```

### Embedded mode
Qdrant can run as a server (Docker) or **embedded**, as just a folder on disk:

```python
client = QdrantClient(path="qdrant_data")
```

Chosen because it is easy to develop with and needs no Docker. The limits: only one process can use the folder at a time, and the folder must survive restarts (a problem when deploying; Chapter 14).

### Keep each technology in its own file
All Qdrant code lives in `vector.py`. The rest of the app calls `save_vector(...)` and `search_vector(...)` and has no idea Qdrant exists. This is **separation of concerns**: if you replace Qdrant tomorrow, you change one file.

### Traps and lessons
- **Stale points.** Deleting a folder from SQLite does not touch Qdrant, because they are separate databases. You must delete the vectors yourself (`delete_vectors_for_folder`). **The same gap still exists for deleting a single file**, which is the biggest known bug in this project: deleted files can still be found by search.
- **A harmless shutdown error** (`sys.meta_path is None`) appears when Python exits while the embedded client is closing. Ignore it.

---

## 8. Chapter 6: Two kinds of search are better than one

### The problem
Meaning search is great for ideas and weak for exact things: a project name, an acronym, a function name. Keyword search is the opposite.

> **Picture:** Meaning search is a librarian who understands what you *mean*. Keyword search is Ctrl+F. You want both.

### Keyword search, in SQL
Break the question into words, drop the boring ones ("the", "is", "what"), and look for each remaining word in the section, title, keywords and text:

```sql
SELECT ... FROM chunks
WHERE LOWER(section) LIKE ? OR LOWER(title) LIKE ?
   OR LOWER(keywords) LIKE ? OR LOWER(chunk_text) LIKE ?
```

Results where the **section** equals the word come first, then title matches, then keyword matches, then body matches. So the question *"what are the projects"* gives the five `PROJECTS` chunks first.

**Stop words** come from the `nltk` library. This is the *only* reason `nltk` is installed. The code has a built-in fallback list in case the data is missing.

### Merging
Run both searches, then combine the lists. The same chunk may appear in both, so **deduplicate by chunk id**:

```python
merged[chunk_id] = result        # same id twice? it only exists once
```

Each result remembers where it came from (`vector`, `keyword`, or both).

### Lessons
- **Retrieval always returns something**, even when nothing relevant exists. "Give me the 20 nearest" always has 20 answers, however far away. Deciding "this is not actually relevant" is the AI's job (Chapter 8), not retrieval's.
- Dedupe by a **stable id** (`chunk_id`). An earlier version used `chunk_index`, which repeats across files, and chunks overwrote each other.

---

## 9. Chapter 7: The strict teacher (reranking)

### The problem
After merging you have about 20-40 candidates in a rough order. The order is often wrong.

### The idea: a second, more careful reader
There are two kinds of models, and the difference matters:

| | Embedding model (a "bi-encoder") | Reranker (a "cross-encoder") |
|---|---|---|
| Reads | One text at a time | The question **and** one chunk **together** |
| Speed | Fast (compare numbers) | Slow (read every pair) |
| Used for | Finding candidates among thousands | Re-sorting a short list |

> **Picture:** Vector search and keyword search are two friends who each tear out a stack of possibly useful pages. The reranker is a strict teacher who reads each page *next to your question* and re-sorts the stack by real usefulness.

A reranker re-orders; it never finds new things. If the right chunk was not in the candidates, it cannot be rescued.

### Bug 1: the reranker ignored the labels
**Symptom:** *"What are the projects?"* returned internship chunks, not project chunks, though the project chunks existed.
**Cause:** the reranker only read `chunk_text`. It never saw `section = PROJECTS`. It was reading the pages but ignoring the chapter titles.
**Fix:** give it the labels too.

```python
def build_retrieval_text(result):
    return f"Section: {result['section']}\nTitle: {result['title']}\nKeywords: ...\nContent:\n{result['chunk_text']}"
```

And add a small **metadata score** for questions that mention the section or title words:

```
final = reranker_score + metadata_score + 0.05 * vector_score
metadata_score = 2.0*section matches + 1.25*title matches + 1.0*keyword matches + 0.1*body matches
```

### Bug 2: it took ~16 seconds
You did not guess. You wrapped each stage in a stopwatch:

```python
t0 = time.time()
rerank(...)
print(f"rerank took {time.time() - t0:.2f}s")
```

Result: the local reranker was about **80%** of total time (it ran on a CPU, reading every pair). You swapped it for **Cohere's hosted Rerank API** (someone else's powerful machine does the reading). Rerank time dropped from ~16 s to under 1 s.

```python
response = cohere_client.rerank(model="rerank-v3.5", query=question, documents=documents)
```

Note: Cohere returns results in its own order with an `index` pointing back to your list. You write each score back using that index, then sort.

### Lessons
- **Never guess what is slow. Measure.**
- **Offload heavy work** to a hosted API when your own machine cannot do it fast.
- When ranking is wrong, ask: *what information does the ranker actually see?*

---

## 10. Chapter 8: Asking the AI properly

### Building the prompt
The top 5 chunks go into a prompt with firm rules:

```
You are an AI assistant that answers questions using the provided notes.

Retrieved Notes
  <chunk 1> ... <chunk 5>

Question
  <the user's question>

Rules
1. Answer only from the notes.
2. If the answer isn't available, say so.
3. Don't hallucinate.
4. Be concise.
5. Include code when useful.
```

Rule 2 is what turns a guessing machine into an honest assistant.

### Story: the "wrong" answer that was right
You asked *"What is the linear regression formula?"* and the app replied that the notes mention a goal and a distance formula, *but the regression formula itself is not provided*. It felt like a bug.

You checked the database directly:

```
chunk 243 | Linear Regression
- A linear regression goal is to minimize the distance to find the best fit line.
- Distance formula: sqrt((x2-x1)^2 + (y2-y1)^2)
```

That was **all** the notes said. The AI was perfectly right. The distance formula was never the regression formula; the confusion was in the reader, not the system.

> **Lesson:** Before you "fix" a wrong-looking answer, look at the raw data the AI was given. An answer that feels wrong can be an accurate report of thin notes.

### The reverse trap: a right answer that proves nothing
Asking *"What is Python?"* and getting a correct answer does **not** prove retrieval worked. The AI may simply know Python. To test a RAG system:

1. Ask about something **only your notes contain**.
2. **Print the chunks that were retrieved**, and do not trust the final answer alone.

### The silent `...` bug
A prompt template was copied with a literal `...` in the middle. Nothing crashed. The AI politely replied, *"Okay, please provide the notes now."* A broken prompt produces a confusing but valid-looking result. Always print the prompt when something is odd.

### The indentation bug
`rag_prompt = ...` was accidentally indented *inside* the `for` loop that builds the context. With zero chunks (an empty folder) the loop body never runs, the prompt is never created, and the route crashes. Build the prompt **after** the loop.

---

## 11. Chapter 9: Giving the app a memory

### The problem
You ask *"What is pip used for?"* Then: *"does it come pre-installed?"* The word "it" means nothing to the search functions. They only ever see the literal text you give them.

### The idea: rewrite the follow-up question first
Before searching, a small AI call turns the follow-up into a standalone question using the recent chat:

```
History:  User: What is pip used for?  Assistant: ...
Follow-up: does it come pre-installed?
Standalone: Does pip come pre-installed?
```

The instruction is firm: *"Do NOT answer the question. Only rewrite it."* The search then runs on the rewritten question.

```python
standalone_question = contextualize_question(payload.question, recent_history)  # last 8 messages
```

**What gets saved?** The question the user actually typed, not the rewrite. The history should show what the person said.

### How to test this fairly
Your first test (*"What is Python?"* then *"so it is a high level programming language?"*) passed, but it was a weak test: both questions shared words ("programming", "language") so keyword search could succeed by luck. The **fair test** shares *no* words (*"pip"* then *"does it come pre-installed?"*). Only if that works is the feature real.

> **Lesson:** a test proves something only if you have removed every lucky path to the right answer.

### Storing chats
```
chat_sessions(id, folder_id, title, created_at)
chat_messages(id, session_id, role, content, created_at)    role = 'user' | 'assistant'
```

Same parent-child idea as folders and files, and the same `ON DELETE CASCADE`.

**Save after success.** The question and answer are saved only after the AI answered. If the AI call fails, you never get a question with no answer in your history.

---

## 12. Chapter 10: From script to real app (FastAPI)

### Why leave Streamlit?
Streamlit is wonderful for trying an idea, but it **re-runs your whole script on every click**. That caused the duplicate saves, a dropdown that "remembered" its own value and ignored your code, and a 30-second wait when switching chats. It is also hard to make look like a real product.

The standard split:

- **Backend** (the kitchen): data and logic, no looks. **FastAPI**.
- **Frontend** (the dining room): looks and clicks, no secrets. **React**.
- They talk through **routes**: URLs the frontend can call.

### A route is just a function behind a URL
```python
@app.get("/folders")
def list_folders(authorized: None = Depends(verify_token)):
    cursor.execute("SELECT id, title FROM folders ORDER BY title")
    return [{"id": r[0], "title": r[1]} for r in cursor.fetchall()]
```

- `@app.get("/folders")`: when someone requests `GET /folders`, run this.
- The returned list becomes JSON automatically.
- `Depends(verify_token)`: before running, check the login token.

### Verbs
`GET` read, `POST` create, `DELETE` remove. A path that exists with a different verb gives **405 Method Not Allowed**. (This happened when `list_files` was accidentally deleted: the path still existed for `POST`, so `GET` returned 405 instead of 404.)

### Login in four lines of thinking
1. User sends the password to `POST /login`.
2. If it matches `ACCESS_PASSWORD` from `.env`, the server creates a **JWT**, a signed "wristband" that expires in 7 days.
3. The frontend keeps the token and sends it as `Authorization: Bearer <token>` on every request.
4. The server checks the signature. No password is sent again.

Secrets (`JWT_SECRET`, API keys) live in `.env`, never in the code, and `.env` is in `.gitignore`.

### Uploading files
A file is not JSON, it is raw bytes, so the request is **multipart form data**:

```python
@app.post("/folders/{folder_id}/upload")
async def upload_file(folder_id: int, file: UploadFile = File(...), ...):
    file_bytes = await file.read()     # reading is asynchronous, so the route is async def
```

FastAPI needs the `python-multipart` package for this. You never import it; FastAPI uses it internally. The route then runs the pipeline: extract, chunk, embed, save to SQLite, save to Qdrant.

A shared helper `index_document(folder_id, name, text)` holds the chunk-embed-save logic so any route can reuse it.

### CORS: the invisible wall
Browsers refuse to let a page from one address (`localhost:5173`, React) call another (`localhost:8000`, FastAPI). That is the **Same-Origin Policy**, a safety rule. **`curl` ignores it**, so everything worked in curl and would have silently failed in the browser. The fix is a short allow-list in the backend:

```python
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
```

You can only prove CORS works **from a browser tab** (DevTools console `fetch(...)`).

### How to test each route first
Before touching the frontend, test every route with `curl`:

```
curl.exe -X GET http://127.0.0.1:8000/folders -H "Authorization: Bearer YOUR_TOKEN"
```

Use `cmd.exe`, not PowerShell (PowerShell mangles the escaped quotes and produces confusing errors). Run test scripts as modules from `backend/`: `python -m tests.check_python_folder`.

### Traps and lessons
- **`200 OK` only proves the function reached `return`.** A save inside it can still have failed silently. Verify side effects by fetching the data again.
- **A frozen request is often a crashed server.** curl "hung" because uvicorn had died at startup on a missing import. Look at the *server's* terminal, not the client's.
- **A `/ask` that timed 8-9 seconds was not broken.** Two sequential AI calls and one rerank call add up.

---

## 13. Chapter 11: The face (React)

### The mental model: the screen is a picture of your data
In React you do not "change the page". You change **state** (data), and React redraws the page to match.

```jsx
const [folders, setFolders] = useState([]);   // [value, function-to-change-it]
```

Calling `setFolders(newList)` is how you update the screen. Changing the list in any other way will not.

### The golden rule: never guess what the backend contains
Early code edited the frontend's own copy of the data (a "sticky note" copy of the teacher's whiteboard). When it guessed wrong, nothing told it so. The rule that fixed almost everything:

```
1. Tell the backend to do something   (create / delete / upload)
2. Wait for it to confirm
3. Ask the backend again for the real list
4. Put that real list on screen
```

```jsx
apiFetch(token, '/folders', { method: 'POST', ... }).then(() => fetchFolders());
```

### `fetch`, `async`, `await`, `.json()` with pizza
- `fetch(url)`: you phone the restaurant to order. The pizza does not arrive instantly.
- `async`: the recipe says "this has a waiting step".
- `await`: stand at the door until it arrives.
- `.json()`: open the box so you can use what is inside. Opening takes a moment too.

### `useEffect`: "after you draw the screen, run this errand"
```jsx
useEffect(() => { if (token) fetchFolders(); }, [token]);
```
The `[token]` means "only redo this when `token` changes". It was `null` before login and a string after, so it fires exactly once, right after login.

### Early returns decide what the user sees
```jsx
if (!token)       return <LoginScreen onLoginSuccess={setToken} />;
if (previewFile)  return <FilePreviewPage ... />;
return <TheFinderWindow />;
```
Check state, return a completely different screen. **All hooks must come before these returns.**

### Props: a child reports to its parent
`LoginScreen` does not own the token. It is handed a function (`onLoginSuccess`) and calls it with the token. The parent decides what to do. Like a delivery person who hands over a parcel and does not decide where it goes.

### The token lives in memory, not `localStorage`
Refreshing the page logs you out. That is a deliberate, simple safety trade-off: `localStorage` can be read by anything running on the page.

### One helper to stop repeating yourself
The line `Authorization: Bearer ${token}` appeared in about 15 places. It became one function in `api.js`:

```js
export function apiFetch(token, path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
}
// usage
apiFetch(token, `/sessions/${id}/messages`)
```

Do not set `Content-Type` yourself for file uploads. The browser must set it, because it adds a hidden "boundary" marker. For JSON, you do set `'Content-Type': 'application/json'`.

### Translating shapes
The backend returns a flat list: `[{ id: 3, title: "Bills" }]`. The Finder UI wants a tree: `{ id, name, type: 'folder', children: [...] }`. Do not force either side to change; put **one translation step** between them (an effect that rebuilds the tree whenever `folders` changes).

### Ids must not collide
A file with id `4` and a folder with id `4` look identical to React's list system. So files get a frontend-only prefix: `file-4`. **Strip it again before talking to the backend** (`String(id).replace('file-', '')`).

### Showing Markdown (and math)
Showing `{file.content}` prints the raw symbols. A **parser** must turn text into elements:

```jsx
<ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
  {content}
</ReactMarkdown>
```

- `react-markdown`: headings, lists, code.
- `remark-gfm`: tables (a separate dialect of Markdown).
- `remark-math` + `rehype-katex` + `katex/dist/katex.min.css`: formulas. Without the CSS, math renders but looks broken.

### Traps and lessons
- **Two doors, one wired.** Opening a folder from the grid fetched files; opening it from the sidebar did not. Fix: put the fetch in **one function** and call it from both places.
- **Invisible headings.** A global CSS rule coloured headings with a near-white variable in dark mode, on a white page. The more specific rule wins: `.file-preview-content h1 { color: ... }` beats `h1 { ... }`. If a style "randomly" does not apply, look for a more specific rule somewhere else.
- **Rendering bug vs bad data.** Some PDF-derived notes show literal `<br>` tags. The renderer was correct; the *text* was messy. Ask: "is what I see what the data actually says?"

---

## 14. Chapter 12: The chat widget

### What it is
A round button fixed to the bottom-right corner, like the support chat on a shopping site. Click it and a panel opens. A small icon switches the panel into a full-height sidebar.

```jsx
style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000 }}
```

`position: fixed` pins it to the screen, so it floats above everything and does not scroll away.

### Only inside a folder
Chat is per folder (just like the old app), because `/ask` needs a `folder_id`. So it is rendered only when you are not at Home:

```jsx
{!isAtRoot && <ChatWidget folderId={currentFolder.id} token={token} />}
```

### What happens when you open it
1. `GET /folders/{id}/sessions` to see existing chats. If there are none, `POST` to create one, then ask again.
2. Pick the **oldest** chat as the default (the long-running conversation).
3. `GET /sessions/{id}/messages` to load history.

### What happens when you send
1. Show your question immediately (add it to local state) so the screen does not feel frozen for the ~8 seconds.
2. `POST /ask`.
3. Then **ask the backend again** for the real messages (the golden rule).

### Sessions: history, new chat, delete
A history icon swaps the message area for a list of chats, each with a date and a trash icon, plus a **New Chat** button. All management happens on that page.

Edge cases that must be handled:
- **Deleting the chat that is open**: switch to the newest remaining one.
- **Deleting the last chat**: immediately create a fresh one, so the panel never has "no chat".
- **A trash click must not also select the row**: `e.stopPropagation()`.

### Floating vs sidebar: one component, two styles
```jsx
const panelStyle = viewMode === 'sidebar' ? { /* top:0; right:0; bottom:0; width:380px */ }
                                           : { /* bottom:92px; right:24px; 340x460 */ };
```
One piece of state (`viewMode`), two style objects.

### Traps and lessons
- **A phantom "empty chat".** Auto-picking the *newest* chat landed on an empty one made by an old curl test while the real history sat in an older chat. Before assuming a frontend bug, query the database: it showed two sessions for one folder.
- **Code blocks spilling sideways.** A flex child (the chat bubble) can be forced wider than its `max-width` by content that refuses to wrap (a `<pre>` code block). Fix: `overflow: hidden` on the bubble, and `overflow-x: auto` on `pre` so the code scrolls *inside its own box*.
- **The "fix" that made it worse.** Three CSS and JS changes were applied at once, nothing could be isolated, and the code was reverted. Then one change at a time worked. **One change, test, then the next.**
- **Verify icon names** before importing. Icon libraries rename icons between versions; check the installed package.

---

## 15. Chapter 13: Uploading, properly

What the upload flow became:

- **A modal with a dashed box**: drag files onto it, or click "Browse Computer...".
- **Also drop anywhere on the folder window** (a blue overlay appears).
- **Many files at a time, one after another**:

```jsx
for (let i = 0; i < files.length; i++) {
  setUploadingName(`"${files[i].name}" (${i + 1} of ${files.length})`);
  await apiFetch(token, `/folders/${folderId}/upload`, { method: 'POST', body: formData });
  fetchFiles(folderId);               // each file appears as soon as it is done
}
```

**Why not all at once?** The backend shares one database cursor. Parallel uploads could mix up row ids. One at a time is safe, simple, and still shows progress.

- **A progress pill** with a spinner stays until the batch ends.
- **Failures are collected** and shown in one alert at the end, so one bad file does not hide the others.

### Traps and lessons
- **Clear the file input after reading it, not before.** `e.target.files` is live; clearing `e.target.value` empties it. Copy first: `Array.from(e.target.files)`.
- **A feature that exists in code but not on screen.** Drag and drop existed on the folder window, but the modal showed nothing about it, so it seemed missing. If users cannot see a feature, it does not exist for them.
- **Instructions by line number break.** An edit "replace lines 620-677" hit the wrong block of a file that differed from what was assumed, deleting the New Folder modal. When editing, find code by **what it is**, or replace the whole file.
- **A leftover crash.** Deleting two state variables while an old modal still used them gave a blank white page (a React error). Remove a feature **completely** (state, handler, markup), or not at all.

---

## 16. Chapter 14: The deployment reality check

### What "deploy" means
Right now the app runs on your laptop. Deploying means running the backend and frontend on other computers so anyone can open a link.

### The plan that was made
- Frontend: **Vercel** (free, great for React).
- Backend: **Render** free web service.
- Database: SQLite to **Postgres** (Supabase or Neon).
- Vectors: local Qdrant folder to **Qdrant Cloud**.

### Why the databases must move
Free hosts give you a **temporary disk**. When the service restarts, files like `notes.db` and `qdrant_data/` vanish. A database has to live somewhere permanent.

### What was learned by measuring (not guessing)
Free-tier facts checked in October 2026:

- Render free web service: **512 MB RAM**, spins down after **15 minutes** idle, about **one minute** to wake up.
- Render's own free Postgres expires after 30 days (so use Supabase or Neon).
- Qdrant Cloud free cluster: 1 GB RAM; paused after 7 days without use.

Then you opened Task Manager and measured your backend: **about 512 MB** once the embedding model loaded. Exactly the whole budget, before serving a single request. It would not fit.

**The cause:** the local embedding model (sentence-transformers + PyTorch).
**The way out:** use a **hosted embedding API** (the same move you made for reranking). The catch: new embeddings are incompatible with the old ones, so everything is re-embedded once, and the vector size in `vector.py` changes.

### Things a Postgres move would touch
- `?` placeholders become `%s`.
- `cursor.lastrowid` becomes `INSERT ... RETURNING id`.
- `AUTOINCREMENT` becomes an identity column; `DATETIME` becomes `TIMESTAMP`.
- One global connection shared by every request is unsafe; use a connection pool.
- The frontend's hard-coded `http://127.0.0.1:8000` becomes an environment variable; CORS must allow the real frontend address.
- A free backend sleeps, so the first request after a pause needs a "waking up..." message.

The project was paused here. Everything above is finished and tested locally.

> **Lesson:** Before choosing infrastructure, measure what your app needs (memory, disk, startup time) and compare it with the host's limits.

---

## 17. How to build your own, from scratch

A build order where **each step has a way to prove it works** before the next begins.

| # | Build | Prove it works |
|---|---|---|
| 1 | Python venv + a script that reads one file into text | `print(text)` shows what you expect |
| 2 | SQLite tables: folders, files, chunks | A small script inserts and lists rows |
| 3 | A chunker (start simple: split on headings) | Print every chunk's title and length |
| 4 | Embeddings for chunks | `len(embedding)` equals the expected dimension |
| 5 | Vector DB: save a chunk, then search | A search for text you know is in a chunk returns that chunk first |
| 6 | Keyword search in SQL | Search a word you know exists |
| 7 | Merge both, dedupe by id | No chunk appears twice |
| 8 | Rerank | Compare order before and after, with scores printed |
| 9 | Prompt + LLM answer | Ask about a fact only your notes contain; print the retrieved chunks too |
| 10 | Chat tables + question rewriting | The *fair test* (no shared words) |
| 11 | FastAPI: one route at a time | `curl` each one |
| 12 | Login (JWT) + CORS | Test CORS from a browser console |
| 13 | React: login, then read-only lists | Real data on screen |
| 14 | React: create, delete, upload (with the "ask again" rule) | Refresh the page; it is still there |
| 15 | Chat UI | Ask, refresh, history is still there |
| 16 | Measure memory and time; then pick a host | Numbers written down |

**Rules of thumb:**
- Build the **ingest** side (files in, searchable) completely before the **ask** side.
- Add a new tool only when the current one visibly fails.
- Every time you add a stage, keep the stopwatch from Chapter 7.

---

## 18. Habits that saved me

1. **One change, then test.** When three changes went in together, nothing could be isolated, and the work had to be undone.
2. **Measure, do not guess.** Stopwatches found the slow reranker; Task Manager found the memory problem.
3. **Look at the real data.** Ten minutes querying the database settled debates that guessing could not (the regression formula; the empty chat session).
4. **Fair tests only.** Remove every lucky path to a correct-looking result.
5. **A success message is not proof.** `200 OK` means the function returned. Fetch the data again to see if it saved.
6. **Source of truth.** The backend owns the data. The frontend asks, never assumes.
7. **Trace backwards through a pipeline.** Empty results? Check the step before, then the one before that.
8. **Read the server terminal.** A hanging client usually means a crashed server.
9. **Separate "wrong display" from "wrong data".**
10. **Keep each technology in its own file** (`vector.py` for Qdrant, `chat_store.py` for chat SQL, `api.js` for fetch). Replacing one part later is easy.
11. **Reject what you do not support, loudly.**
12. **Use plain code before AI.** A rule-based chunker beat an LLM one on cost, speed and predictability.
13. **Keep a dev log.** Writing down each problem, cause and fix is how this document exists.

---

## 19. Bug museum

| Symptom | Real cause | Fix |
|---|---|---|
| No chunks created | Chunker expected `###`, AI wrote `##` | Support all heading levels |
| `ModuleNotFoundError` after `pip install` | Installed into a different Python environment | Activate the right venv, install, verify with `__file__` |
| Same file saved repeatedly | Streamlit re-ran the script on every click | Wrap upload in a form |
| "Projects" question returned internships | Reranker never saw the section label | Include section/title/keywords in rerank input |
| Reranking took 16 s | Local model on a CPU | Hosted Cohere Rerank |
| Dropdown ignored the code | Widget kept its own memory | Buttons + one source of truth |
| curl works, browser fails | No CORS | `CORSMiddleware`, test from a browser |
| curl "hangs" | Server crashed on a missing import | Read the uvicorn terminal |
| PowerShell curl gives JSON/port errors | PowerShell mangled the quotes | Use `cmd.exe` |
| `200 OK` but nothing saved | Typo in the save lines after the response was built | Re-fetch to verify side effects |
| Prompt returned "please provide the notes" | Literal `...` left inside the prompt | Print the prompt |
| Chat crashed in an empty folder | Prompt built inside the `for` loop | Build after the loop |
| Headings invisible | Global dark-mode colour on a white page | More specific CSS rule |
| Tables shown as `\|` pipes | `react-markdown` lacks table support | Add `remark-gfm` |
| Sidebar-opened folder showed no files | Fetch wired in one navigation path only | One shared fetch function |
| Deleting a file did nothing | Frontend used a fake id with a prefix | Strip the prefix before the request |
| Math shown as `$\sqrt{...}$` | Markdown parser cannot do LaTeX | `remark-math` + `rehype-katex` + CSS |
| Code block pushed the chat bubble wider | Flex item grew to fit non-wrapping content | `overflow: hidden` + scrolling `pre` |
| Old chat history "missing" | Widget opened a newer, empty session | Open the oldest session by default; check the DB |
| `.docx` upload silently did nothing | Extractor returned `None`; DB rejected it | Validate type, return a clear error, show it |
| New file text saved nowhere | Frontend only edited its own copy | Call a backend route, then re-fetch |
| `GET .../files` returned 405 | The route got deleted while editing | Restore the route |
| Blank white page | A removed variable was still used in markup | Remove features completely |
| Deleted file still appears in answers | Qdrant vectors were not deleted with the file | **Open bug: delete the vectors too** |

---

## 20. Glossary

- **API**: a menu of things one program lets another program ask for.
- **Async / await**: "this takes time; wait for it without freezing everything".
- **Chunk**: a small piece of a document about one topic.
- **CORS**: browser rule that blocks a web page from calling another address unless allowed.
- **Cosine similarity**: how alike two vectors' directions are.
- **Cross-encoder (reranker)**: a model that reads a question and a text together to judge relevance.
- **Embedding**: a list of numbers that represents the meaning of text.
- **FastAPI**: a Python framework for building web APIs.
- **Foreign key**: a column that points to a row in another table.
- **Hallucination**: an AI stating something that is not true or not in the source.
- **Hybrid search**: combining meaning search with keyword search.
- **JWT**: a signed login token that expires.
- **LLM**: a large language model (Gemini, GPT, ...).
- **Markdown**: plain text with light formatting symbols (`#`, `-`, `` ``` ``).
- **Multipart form data**: the request format used to send files.
- **OCR**: software that recognises letters in images.
- **Payload**: extra information stored next to a vector.
- **Prompt**: the instructions and material you give an AI.
- **RAG**: giving an AI relevant text from your own data before it answers.
- **Rerank**: re-sorting search results by closer reading.
- **Route**: a URL on the backend that runs a function.
- **Same-Origin Policy**: the browser safety rule behind CORS.
- **State (React)**: data that, when changed, makes the screen redraw.
- **Stop words**: very common words ("the", "is") ignored in keyword search.
- **Token**: here, the login wristband. (Not the same as an LLM "token", a piece of a word.)
- **Vector**: a list of numbers; used here as a coordinate for meaning.
- **Vector database**: a database built to find the closest vectors fast.
- **VLM**: a vision-language model: an AI that can look at images.

---

*You built this. Every bug above was real, and you found every one by looking carefully. The same habits will carry you through the next project.*
