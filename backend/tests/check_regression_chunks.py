from database import conn

rows = conn.execute("""
    SELECT id, file_id, section, title, chunk_text
    FROM chunks
    WHERE LOWER(chunk_text) LIKE '%regression%'
       OR LOWER(title) LIKE '%regression%'
""").fetchall()

for chunk_id, file_id, section, title, text in rows:
    print("=" * 50)
    print(f"chunk {chunk_id} | file {file_id}")
    print(f"Section: {section} | Title: {title}")
    print(text)
    print()