from database import conn, cursor


def create_session(folder_id, title="New Chat"):
    cursor.execute(
        "INSERT INTO chat_sessions (folder_id, title) VALUES (?, ?)",
        (folder_id, title)
    )
    conn.commit()
    return cursor.lastrowid


def get_sessions(folder_id):
    cursor.execute(
        """
        SELECT id, title, created_at
        FROM chat_sessions
        WHERE folder_id = ?
        ORDER BY created_at DESC
        """,
        (folder_id,)
    )
    return cursor.fetchall()


def rename_session(session_id, title):
    cursor.execute(
        "UPDATE chat_sessions SET title = ? WHERE id = ?",
        (title, session_id)
    )
    conn.commit()


def delete_session(session_id):
    cursor.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
    conn.commit()


def save_message(session_id, role, content):
    cursor.execute(
        "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
        (session_id, role, content)
    )
    conn.commit()
    return cursor.lastrowid


def get_messages(session_id, limit=None):
    cursor.execute(
        """
        SELECT role, content
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY created_at ASC
        """,
        (session_id,)
    )
    rows = cursor.fetchall()

    if limit:
        rows = rows[-limit:]

    return [{"role": role, "content": content} for role, content in rows]