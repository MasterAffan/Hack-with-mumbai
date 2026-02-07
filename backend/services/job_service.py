from datetime import datetime
from typing import Dict, Optional
from models.job import JobStatus, VideoJob, VideoJobRequest
from services.storage_service import StorageService

class JobService:
    def __init__(self, vertex_service=None, storage_service: Optional[StorageService] = None):
        self.vertex_service = vertex_service
        self.storage = storage_service
        self.jobs: Dict[str, VideoJob] = {}

    async def create_video_job(self, data: VideoJobRequest) -> str:
        job_id = f"job-{int(datetime.utcnow().timestamp())}"
        op = await self.vertex_service.generate_video_content(
            prompt=data.custom_prompt or data.global_context or "Generate a short scene",
            image_data=data.starting_image,
            ending_image_data=data.ending_image,
            duration_seconds=data.duration_seconds,
        )
        operation_name = getattr(op, "name", None) or (op.get("operation_name") if isinstance(op, dict) else None) or "unknown-operation"
        self.jobs[job_id] = {
            "job_id": job_id,
            "operation_name": operation_name,
            "job_start_time": datetime.utcnow().isoformat(),
            "metadata": {},
        }
        return job_id

    async def get_video_job_status(self, job_id: str) -> Optional[JobStatus]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        op_name = job["operation_name"]
        status = await self.vertex_service.get_video_status_by_name(op_name)
        # Map gs:// to https public URL
        if status and status.video_url and status.video_url.startswith("gs://") and self.storage:
            status.video_url = self.storage.gcs_uri_to_public_url(status.video_url)
        return status
