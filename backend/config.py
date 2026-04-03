import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

def get_llm():
    """Factory: returns the LLM configured in .env. Agents call this."""
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    model    = os.getenv("LLM_MODEL", "gemini-2.5-flash-preview")

    if provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=os.environ.get("GEMINI_API_KEY", "mock_key")
        )
    elif provider == "openai":
        return ChatOpenAI(
            model=model,
            api_key=os.environ.get("OPENAI_API_KEY", "mock_key")
        )
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
