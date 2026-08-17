from gemini_client import client
from openrouter_client import openrouter_client


def contextualize_with_gemini(question, history_text):
    prompt = f"""Given the conversation history and a follow-up question, rewrite the
follow-up question into a standalone question that contains all necessary
context and can be understood without the history.

Do NOT answer the question. Only rewrite it.
If it's already standalone, return it unchanged. Return ONLY the question.

Conversation History:
{history_text}

Follow-up Question: {question}

Standalone Question:"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt]
    )

    return response.text.strip()


def contextualize_with_openrouter(question, history_text):
    prompt = f"""Given the conversation history and a follow-up question, rewrite the
follow-up question into a standalone question that contains all necessary
context and can be understood without the history.

Do NOT answer the question. Only rewrite it.
If it's already standalone, return it unchanged. Return ONLY the question.

Conversation History:
{history_text}

Follow-up Question: {question}

Standalone Question:"""

    response = openrouter_client.chat.completions.create(
        model="google/gemma-4-26b-a4b-it:free",
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    return response.choices[0].message.content.strip()


def contextualize_question(question, history):
    if not history:
        return question

    history_text = "\n".join(
        f"{turn['role'].capitalize()}: {turn['content']}"
        for turn in history
    )

    try:
        return contextualize_with_gemini(question, history_text)
    except Exception:
        return contextualize_with_openrouter(question, history_text)


def answer_with_gemini(rag_prompt):
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[rag_prompt]
    )
    return response.text


def answer_with_openrouter(rag_prompt):
    response = openrouter_client.chat.completions.create(
        model="google/gemma-4-26b-a4b-it:free",
        messages=[
            {
                "role": "user",
                "content": rag_prompt,
            }
        ],
    )

    return response.choices[0].message.content


def answer_question(rag_prompt):
    try:
        return answer_with_gemini(rag_prompt)
    except Exception:
        return answer_with_openrouter(rag_prompt)