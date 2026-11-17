FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ranking.py ./
RUN useradd -r app && chown -R app /app
USER app
# Railway injects PORT
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2 --no-access-log"]
