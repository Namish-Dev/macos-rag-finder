from gemini_client import client
import openrouter_client

def format_gemini(raw_text):
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            Prompt,
            raw_text,
        ],
    )

    return response.text

def format_with_openrouter(raw_text):

    response = openrouter_client.chat.completions.create(
        model="google/gemma-4-26b-a4b-it:free",   # or another vision model
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"{Prompt}\n\n{raw_text}",
                    },
                ],
            }
        ],
    )

    return response.choices[0].message.content



def format_text(raw_text):
    try:
        # st.info("Using Gemini...")
        return format_gemini(raw_text)

    except Exception as e:
        # st.warning(f"Gemini failed: {e}")
        # st.info("Switching to OpenRouter...")

        return format_with_openrouter(raw_text)

    


Prompt = """You are an expert Markdown formatter.

The following text has already been extracted from a document.

Your task is ONLY to organize it into clean Markdown.

Requirements:
- Preserve ALL information.
- Do NOT summarize.
- Do NOT rewrite.
- Do NOT explain.
- Do NOT invent information.
- Create headings only when necessary.
- Preserve code blocks.
- Preserve tables where possible.
- Return ONLY Markdown."""