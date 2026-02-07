from datetime import datetime
from typing import Dict, Optional
from models.job import JobStatus, VideoJob, VideoJobRequest
from services.storage_service import StorageService
from utils.env import settings
import json
try:
    from redis.asyncio import Redis
except Exception:
    Redis = None

class JobService:
    def __init__(self, vertex_service=None, storage_service: Optional[StorageService] = None):
        self.vertex_service = vertex_service
        self.storage = storage_service
        self.jobs: Dict[str, VideoJob] = {}
        self.redis: Optional[Redis] = None
        if Redis and getattr(settings, "REDIS_URL", None):
            try:
                self.redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            except Exception:
                self.redis = None

    async def create_video_job(self, data: VideoJobRequest) -> str:
        job_id = f"job-{int(datetime.utcnow().timestamp())}"
        op = await self.vertex_service.generate_video_content(
            prompt=data.custom_prompt or data.global_context or "Generate a short scene",
            image_data=data.starting_image,
            ending_image_data=data.ending_image,
            duration_seconds=data.duration_seconds,
        )
        operation_name = getattr(op, "name", None) or (op.get("operation_name") if isinstance(op, dict) else None) or "unknown-operation"
        record = {
            "job_id": job_id,
            "operation_name": operation_name,
            "job_start_time": datetime.utcnow().isoformat(),
            "metadata": {},
        }
        if self.redis:
            await self.redis.set(f"job:{job_id}", json.dumps(record))
        else:
            self.jobs[job_id] = record
        return job_id

    async def get_video_job_status(self, job_id: str) -> Optional[JobStatus]:
        job = None
        if self.redis:
            raw = await self.redis.get(f"job:{job_id}")
            if raw:
                job = json.loads(raw)
        else:
            job = self.jobs.get(job_id)
        if not job:
            return None
        op_name = job["operation_name"]
        status = await self.vertex_service.get_video_status_by_name(op_name)
        # Map gs:// to https public URL
        if status and status.video_url and status.video_url.startswith("gs://") and self.storage:
            status.video_url = self.storage.gcs_uri_to_public_url(status.video_url)
        return status
