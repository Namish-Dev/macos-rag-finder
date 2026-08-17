from dotenv import load_dotenv
import os
from openai import OpenAI


load_dotenv()

openrouter_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OpenRouter_API_KEY"),
)
