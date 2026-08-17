# import re

# def create_chunks(content: str):
#     chunks = []

#     # Split whenever there are two consecutive newlines
#     sections = re.split(r"\n\s*\n", content)



#     for i, section in enumerate(sections):
#         section = section.strip()

#         if section:
#             chunks.append({
#                 "chunk_index": i,
#                 "title": section.split("\n")[0],   # First line becomes title
#                 "chunk_text": section
#             })

#     return chunks



import re

def create_chunks(content: str):
    chunks = []

    # Split on Markdown headings (###) , ?= means "lookahead assertion" which allows us to split without consuming the pattern here which is ### , ^ this means at the start of the line, and re.MULTILINE allows ^ to match the start of each line in the string, not just the start of the string.
    sections = re.split(
        r"(?=^#{1,6}\s)",
        content,
        flags=re.MULTILINE
)

    chunk_index = 0

    for section in sections:
        section = section.strip()

        if not section:
            continue

        # Ignore things before the first heading
        if not re.match(r"^#{1,6}\s", section):
            continue

        lines = section.splitlines()

        title = re.sub(r"^#{1,6}\s*", "", lines[0]).strip()

        chunks.append({
            "chunk_index": chunk_index,
            "title": title,
            "chunk_text": section
        })

        chunk_index += 1

    return chunks