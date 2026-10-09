# backend/tests/check_python_folder.py
from database import cursor

cursor.execute("SELECT id, title FROM folders")
print("All folders:")
for row in cursor.fetchall():
    print(" ", row)

cursor.execute("""
    SELECT cs.id, cs.folder_id, cs.title, COUNT(cm.id) as msg_count
    FROM chat_sessions cs
    LEFT JOIN chat_messages cm ON cm.session_id = cs.id
    GROUP BY cs.id
    ORDER BY cs.folder_id, cs.created_at DESC
""")
print("\nAll chat sessions (with message counts):")
for row in cursor.fetchall():
    print(" ", row)