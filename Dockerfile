FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Pre-install lightweight CPU-only PyTorch (~180MB vs 2.5GB CUDA wheel)
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch

# Install application dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Hydrate SQLite database with authentic decisions during build
RUN python scripts/preload_demo_cache.py

EXPOSE 8000

# Run FastAPI with dynamic port binding for cloud platforms
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

