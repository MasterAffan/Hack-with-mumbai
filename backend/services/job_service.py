from datetime import datetime
from typing import Dict, Optional
from models.job import JobStatus, VideoJob

class JobService:
    def __init__(self, vertex_service=None):
        self.vertex_service = vertex_service
        self.jobs: Dict[str, VideoJob] = {}

    async def create_video_job(self, data) -> str:
        job_id = f"job-{int(datetime.utcnow().timestamp())}"
        self.jobs[job_id] = {
            "job_id": job_id,
            "operation_name": "mock-operation",
            "job_start_time": datetime.utcnow().isoformat(),
            "metadata": {},
        }
        return job_id

    async def get_video_job_status(self, job_id: str) -> Optional[JobStatus]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        return JobStatus(job_start_time=datetime.utcnow(), status="waiting", video_url=None)
