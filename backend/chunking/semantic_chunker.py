import re
import string

MAX_CHUNK_CHARS = 1800
OVERLAP_CHARS = 220
KEYWORD_LIMIT = 8
GROUPED_SECTIONS = {
    "CERTIFICATIONS",
    "EDUCATION",
    "EXPERIENCE",
    "INTERNSHIP EXPERIENCE",
    "PROJECT EXPERIENCE",
    "PROJECTS",
    "PUBLICATIONS",
    "WORK EXPERIENCE",
}

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by",
    "can", "could", "did", "do", "does", "for", "from", "had", "has",
    "have", "how", "i", "if", "in", "into", "is", "it", "its", "may",
    "my", "not", "of", "on", "or", "our", "should", "that", "the",
    "their", "there", "these", "this", "to", "was", "were", "what",
    "when", "where", "which", "who", "why", "will", "with", "you",
    "your"
}


def _clean_heading(text):
    text = text.strip()
    text = re.sub(r"^#{1,6}\s*", "", text)
    text = re.sub(r"^\s*[-*•]\s+", "", text)
    text = re.sub(r"[*_`]+", "", text)
    return text.strip(" :\t")


def _uppercase_ratio(text):
    letters = [char for char in text if char.isalpha()]

    if len(letters) < 3:
        return 0.0

    return sum(char.isupper() for char in letters) / len(letters)


def _is_section_heading(title):
    title = _clean_heading(title)
    return _uppercase_ratio(title) >= 0.75


def _heading_title(line):
    stripped = line.strip()

    if not stripped:
        return None

    markdown_heading = re.match(r"^#{1,6}\s+(.+)", stripped)

    if markdown_heading:
        return _clean_heading(markdown_heading.group(1))

    if re.match(r"^\*\*[^*]{2,80}\*\*:?\s*$", stripped):
        title = _clean_heading(stripped)
        return title if _is_section_heading(title) else None

    if stripped.startswith(("-", "*", "|", ">")):
        return None

    if len(stripped) > 90 or stripped.endswith((".", ",", ";")):
        return None

    title = _clean_heading(stripped)

    if _is_section_heading(title):
        return title

    return None


def _item_title(line):
    stripped = line.strip()

    if stripped.startswith(("-", "* ", "|", ">")):
        return None

    match = re.match(r"^\*\*([^*:][^*]{2,80}?)\*\*", stripped)

    if not match:
        return None

    title = _clean_heading(match.group(1))

    if ":" in title or _is_section_heading(title):
        return None

    return title


def _append_section(sections, section, lines):
    text = "\n".join(lines).strip()

    if not text:
        return

    non_empty_lines = [line.strip() for line in lines if line.strip()]

    if len(non_empty_lines) == 1 and _clean_heading(non_empty_lines[0]).lower() == section.lower():
        return

    sections.append((section, text))


def _split_into_sections(markdown_text):
    sections = []
    current_parent_section = "Document"
    current_chunk_section = "Document"
    current_lines = []

    for line in markdown_text.splitlines():
        title = _heading_title(line)

        if title:
            if current_lines:
                _append_section(sections, current_chunk_section, current_lines)
                current_lines = []

            if _is_section_heading(title):
                current_parent_section = title
                current_chunk_section = title
            else:
                current_chunk_section = current_parent_section

            current_lines.append(line.strip())
            continue

        item_title = _item_title(line)

        if item_title and current_parent_section in GROUPED_SECTIONS:
            if current_lines:
                _append_section(sections, current_chunk_section, current_lines)

            current_chunk_section = current_parent_section
            current_lines = [line.strip()]
            continue

        current_lines.append(line.rstrip())

    if current_lines:
        _append_section(sections, current_chunk_section, current_lines)

    return [(section, text) for section, text in sections if text]


def _split_into_blocks(text):
    blocks = []
    current = []
    in_code_block = False

    for line in text.splitlines():
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code_block = not in_code_block
            current.append(line)
            continue

        if not in_code_block and not stripped:
            if current:
                blocks.append("\n".join(current).strip())
                current = []
            continue

        current.append(line)

    if current:
        blocks.append("\n".join(current).strip())

    return blocks


def _split_large_block(block, max_chars):
    if len(block) <= max_chars:
        return [block]

    sentences = re.split(r"(?<=[.!?])\s+", block)
    parts = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()

        if not sentence:
            continue

        if len(sentence) > max_chars:
            if current:
                parts.append(current.strip())
                current = ""

            for start in range(0, len(sentence), max_chars):
                parts.append(sentence[start:start + max_chars].strip())
            continue

        candidate = f"{current} {sentence}".strip()

        if len(candidate) > max_chars and current:
            parts.append(current.strip())
            current = sentence
        else:
            current = candidate

    if current:
        parts.append(current.strip())

    return parts


def _with_overlap(previous_text, text):
    if not previous_text or not text:
        return text

    overlap = previous_text[-OVERLAP_CHARS:].strip()

    if not overlap:
        return text

    return f"{overlap}\n\n{text}"


def _chunk_section(section, text):
    chunks = []
    current = ""
    previous_chunk = ""

    for block in _split_into_blocks(text):
        for piece in _split_large_block(block, MAX_CHUNK_CHARS):
            candidate = f"{current}\n\n{piece}".strip() if current else piece

            if len(candidate) > MAX_CHUNK_CHARS and current:
                chunks.append(current)
                previous_chunk = current
                current = _with_overlap(previous_chunk, piece)
            else:
                current = candidate

    if current:
        chunks.append(current)

    return [(section, chunk) for chunk in chunks]


def _make_title(section, chunk_text):
    for line in chunk_text.splitlines():
        item_title = _item_title(line)

        if item_title:
            return item_title

        line = _clean_heading(line)

        if line:
            line = line.split("|", 1)[0].strip()
            title = line[:90]

            if title.lower() == section.lower():
                return section

            return title

    return section


def _extract_keywords(section, title, chunk_text):
    source = f"{section} {title} {chunk_text}".lower()
    source = source.translate(str.maketrans("", "", string.punctuation))
    words = re.findall(r"[a-z0-9][a-z0-9+#.-]*", source)
    counts = {}

    for word in words:
        if len(word) < 3 or word in STOP_WORDS:
            continue

        counts[word] = counts.get(word, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [word for word, _ in ranked[:KEYWORD_LIMIT]]


def create_semantic_chunk(markdown_text):
    sections = _split_into_sections(markdown_text or "")
    chunk_records = []

    if not sections:
        sections = [("Document", (markdown_text or "").strip())]

    for section, section_text in sections:
        for chunk_section, chunk_text in _chunk_section(section, section_text):
            title = _make_title(chunk_section, chunk_text)

            chunk_records.append({
                "chunk_index": len(chunk_records),
                "section": chunk_section,
                "title": title,
                "chunk_text": chunk_text,
                "keywords": _extract_keywords(chunk_section, title, chunk_text),
            })

    return chunk_records
