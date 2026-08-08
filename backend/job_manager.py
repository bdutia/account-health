"""In-memory background job registry with pub/sub progress streaming for SSE."""

import queue
import threading
import time
import uuid
from typing import Any, Callable


class Job:
    """Tracks progress messages and the final result/error for a single background job."""

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        self.status = "running"  # running | completed | failed
        self.percent = 0
        self.result: Any = None
        self.error: str | None = None
        self._lock = threading.Lock()
        self._messages: list[dict[str, Any]] = []
        self._subscribers: list[queue.Queue] = []

    def log(self, message: str, level: str = "info", percent: int | None = None) -> None:
        with self._lock:
            if percent is not None:
                self.percent = min(max(percent, 0), 100)
            entry = {
                "type": "progress",
                "message": message,
                "level": level,
                "percent": self.percent,
                "timestamp": time.time(),
            }
            self._messages.append(entry)
            for subscriber in self._subscribers:
                subscriber.put(entry)

    def complete(self, result: Any) -> None:
        with self._lock:
            self.status = "completed"
            self.percent = 100
            self.result = result
            entry = {"type": "completed", "percent": 100, "result": result, "timestamp": time.time()}
            self._messages.append(entry)
            for subscriber in self._subscribers:
                subscriber.put(entry)
                subscriber.put(None)

    def fail(self, error: str) -> None:
        with self._lock:
            self.status = "failed"
            self.error = error
            entry = {"type": "failed", "message": error, "timestamp": time.time()}
            self._messages.append(entry)
            for subscriber in self._subscribers:
                subscriber.put(entry)
                subscriber.put(None)

    def subscribe(self) -> "queue.Queue[Any]":
        """Return a queue replayed with history so far; closed with a None sentinel once the job ends."""
        with self._lock:
            subscriber: "queue.Queue[Any]" = queue.Queue()
            for entry in self._messages:
                subscriber.put(entry)
            if self.status == "running":
                self._subscribers.append(subscriber)
            else:
                subscriber.put(None)
            return subscriber


class JobManager:
    """In-memory registry of background jobs, keyed by job id."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(str(uuid.uuid4()))
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def run_in_background(self, job: Job, target: Callable[[Job], Any]) -> None:
        def runner() -> None:
            try:
                result = target(job)
                job.complete(result)
            except Exception as error:
                job.fail(str(error))

        threading.Thread(target=runner, daemon=True).start()


job_manager = JobManager()
