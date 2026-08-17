import os

def get_file_type(filename: str):
    extension = os.path.splitext(filename)[1].lower()

    if extension in [".jpg", ".jpeg", ".png"]:
        return "image"

    elif extension == ".pdf":
        return "pdf"

    elif extension == ".txt":
        return "text"

    elif extension == ".md":
        return "markdown"

    elif extension == ".docx":
        return "docx"

    else:
        return "unknown"