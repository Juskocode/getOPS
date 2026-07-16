FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OPS_DB_PATH=/data/trading_ops_ascent.db

WORKDIR /app

COPY legacy/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt \
    && groupadd --gid 10001 ascent \
    && useradd --uid 10001 --gid ascent --create-home --shell /usr/sbin/nologin ascent \
    && mkdir -p /data /dev/shm \
    && chown -R ascent:ascent /data /dev/shm

COPY server.py ./
COPY legacy/__init__.py ./legacy/__init__.py
COPY legacy/api ./legacy/api
COPY legacy/api/gunicorn.conf.py ./gunicorn.conf.py

USER 10001:10001
EXPOSE 8766

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8766/api/health/ready', timeout=2).read()"]

CMD ["gunicorn", "--config", "gunicorn.conf.py", "server:application"]
