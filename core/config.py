from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    GITHUB_TOKEN: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"

    TARGET_REPO: str = "psf/black"
    LLM_PRIMARY_MODEL: str = "openai/gpt-oss-20b"
    LLM_FALLBACK_MODEL: str = "meta-llama/llama-3.1-8b-instruct"
    ALLOWED_POST_REPOS: str = "my-fork/black,test-org/test-repo"

    RAW_DATA_DIR: Path = Path("data/raw")
    SQLITE_DB_PATH: Path = Path("data/decisiontrail.db")
    EVAL_DB_PATH: Path = Path("data/eval.db")


settings = Settings()

