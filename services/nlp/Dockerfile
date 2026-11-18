FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ranking.py domain_model.py ./
COPY data ./data
# Mount a Railway Volume at /models to keep trained models across deploys
ENV MODEL_DIR=/models
# Runs as root on purpose: Railway mounts volumes root-owned, and a non-root user could not write models to it.
RUN mkdir -p /models
# One worker: the model is trained/loaded at startup and two workers would race to write versions. Railway injects PORT
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-access-log"]
