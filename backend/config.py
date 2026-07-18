import os
from pathlib import Path

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3000/mcp")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama3-70b-8192")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
CHROMA_DB_DIR = os.getenv("CHROMA_DB_DIR", str(Path(__file__).parent / "chroma_db"))
FASTAPI_HOST = os.getenv("FASTAPI_HOST", "0.0.0.0")
FASTAPI_PORT = int(os.getenv("FASTAPI_PORT", "8000"))
