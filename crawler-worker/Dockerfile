FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CRAWLER_WORK_ROOT=/data/leshan-market \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install --with-deps chromium \
    && crawl4ai-setup
COPY app ./app

RUN useradd --create-home --uid 10001 crawler \
    && mkdir -p /data/leshan-market \
    && chown -R crawler:crawler /data/leshan-market /app /ms-playwright
USER crawler

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
