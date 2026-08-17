from dotenv import load_dotenv
import cohere
import os

load_dotenv()

cohere_client = cohere.ClientV2(
    api_key=os.getenv("Cohere_API_KEY")
)