import multiprocessing
import os


bind = "0.0.0.0:8766"
workers = int(os.environ.get("GUNICORN_WORKERS", min(4, max(2, multiprocessing.cpu_count()))))
worker_class = "gthread"
threads = int(os.environ.get("GUNICORN_THREADS", "4"))
timeout = 30
graceful_timeout = 30
keepalive = 5
max_requests = 4000
max_requests_jitter = 400
worker_tmp_dir = "/dev/shm"
control_socket_disable = True
accesslog = None
errorlog = "-"
capture_output = True
forwarded_allow_ips = "*"
limit_request_line = 4094
limit_request_fields = 60
limit_request_field_size = 8190
