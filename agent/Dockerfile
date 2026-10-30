FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl libsndfile1 libgomp1 ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt && pip check
COPY download_models.sh ./
ARG KOKORO_MODEL_BASE_URL
RUN sh download_models.sh
COPY src ./src
COPY knowledge ./knowledge
RUN python src/agent.py download-files && useradd --create-home --uid 1001 yuki
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/src KNOWLEDGE_DIR=/app/knowledge PORT=8081 YUKI_ENV=production YUKI_SHARED_SPEECH=true AGENT_IDLE_PROCESSES=0
USER yuki
EXPOSE 8081
CMD ["python", "src/agent.py", "start"]
