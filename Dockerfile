# One container: the FastAPI backend serving the patient PWA (mobile/dist). Used by Render (render.yaml).

FROM node:22-slim AS pwa
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ ./
RUN npm run build:web

FROM python:3.10-slim
# OCR for uploaded scans and PDFs
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=pwa /mobile/dist /app/mobile/dist
ENV PYTHONUNBUFFERED=1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
