from datetime import datetime
from typing import Optional, Dict
from models.job import JobStatus, VideoJobRequest, VideoJob
from services.vertex_service import VertexService
from utils.prompt_builder import create_video_prompt
from utils.env import settings
import uuid
import asyncio
import traceback
import hashlib

class JobService:
    """
    Simplified JobService that uses in-memory storage instead of Redis.
    For production, you'd want to use Redis or a database for persistence.
    """
    
    def __init__(self, vertex_service: VertexService):
        self.vertex_service = vertex_service
        # In-memory job storage (replaces Redis for MVP)
        self._jobs: Dict[str, dict] = {}
        self._pending_jobs: Dict[str, dict] = {}
        self._error_jobs: Dict[str, dict] = {}
        # Caches for optimization
        self._annotation_cache: Dict[str, str] = {}      # image_hash -> annotation description
        self._cleaned_image_cache: Dict[str, bytes] = {}  # image_hash -> cleaned image bytes

    def _hash_image(self, image_data: bytes) -> str:
        return hashlib.sha256(image_data).hexdigest()

    async def _get_annotations(self, image_data: bytes) -> str:
        img_hash = self._hash_image(image_data)
        if img_hash in self._annotation_cache:
            print(f"[CACHE HIT] Annotations for {img_hash[:12]}")
            return self._annotation_cache[img_hash]
        desc = await self.vertex_service.analyze_image_content(
            prompt="Describe any animation annotations you see. Use this description to inform a video director. Be descriptive about location and purpose of the annotations.",
            image_data=image_data
        )
        self._annotation_cache[img_hash] = desc
        print(f"[CACHE MISS] Annotations for {img_hash[:12]} — cached")
        return desc

    async def _get_cleaned_image(self, image_data: bytes, prompt: str) -> bytes:
        img_hash = self._hash_image(image_data)
        if img_hash in self._cleaned_image_cache:
            print(f"[CACHE HIT] Cleaned image for {img_hash[:12]}")
            return self._cleaned_image_cache[img_hash]
        cleaned = await self.vertex_service._generate_image_raw(
            prompt=prompt,
            image=image_data
        )
        self._cleaned_image_cache[img_hash] = cleaned
        print(f"[CACHE MISS] Cleaned image for {img_hash[:12]} — cached")
        return cleaned

    def _has_annotations(self, description: str) -> bool:
        """Check if annotation description indicates actual annotations exist"""
        if not description:
            return False
        lower = description.lower()
        no_annotation_phrases = [
            "no annotation", "no text", "no caption", "no subtitle",
            "does not contain", "doesn't contain", "no visible",
            "clean image", "no overlays", "without any text",
            "there are no", "i don't see any", "no writing",
        ]
        return not any(phrase in lower for phrase in no_annotation_phrases)

    async def create_video_job(self, request: VideoJobRequest) -> str:
        """Create a video job and return job_id immediately, processing happens in background"""
        job_id = str(uuid.uuid4())
        
        pending_job = {
            "status": "pending",
            "job_start_time": datetime.now().isoformat()
        }
        # Store pending job BEFORE starting background task to avoid 404 race condition
        self._pending_jobs[job_id] = pending_job
        
        # start background task
        asyncio.create_task(self._process_video_job(job_id, request))
        
        return job_id
    
    async def _process_video_job(self, job_id: str, request: VideoJobRequest):
        """Background task that processes the video generation"""
        try:
            print(f"[DEBUG] Starting video job processing for {job_id}")
            
            # Step 1: Get annotations (with cache)
            annotation_description = await self._get_annotations(request.starting_image)
            print(f"[DEBUG] Annotation description: {annotation_description[:100] if annotation_description else 'None'}...")
            
            # Step 2: Only clean image if annotations were found
            if self._has_annotations(annotation_description):
                print(f"[DEBUG] Annotations detected — cleaning starting image")
                starting_frame = await self._get_cleaned_image(
                    request.starting_image,
                    "Remove all text, captions, subtitles, annotations from this image. Generate a clean version of the image with no text. Keep everything else the exact same."
                )
            else:
                print(f"[DEBUG] No annotations detected — skipping image cleaning (saved 1 API call)")
                starting_frame = request.starting_image
            
            # Step 3: Clean ending image if provided (only if it has annotations)
            ending_frame = None
            if request.ending_image:
                ending_annotations = await self._get_annotations(request.ending_image)
                if self._has_annotations(ending_annotations):
                    ending_frame = await self._get_cleaned_image(
                        request.ending_image,
                        "Remove all text, captions, subtitles, annotations from this image. Generate a clean version of the image with no text. Keep the art/image style the exact same."
                    )
                else:
                    ending_frame = request.ending_image
            
            print(f"[DEBUG] Starting frame bytes: {len(starting_frame) if starting_frame else 0}")

            operation = await self.vertex_service.generate_video_content(
                create_video_prompt(request.custom_prompt, request.global_context, annotation_description),
                starting_frame,
                ending_frame,
                request.duration_seconds
            )
            
            print(f"[DEBUG] Video generation started, operation name: {operation.name}")
            
            # Store only the operation name (string) instead of full operation object to save space
            job = {
                "job_id": job_id,
                "operation_name": operation.name,
                "job_start_time": datetime.now().isoformat(),
                "metadata": {
                    "annotation_description": annotation_description
                }
            }
            
            # Move from pending to active jobs
            if job_id in self._pending_jobs:
                del self._pending_jobs[job_id]
            self._jobs[job_id] = job
            print(f"[DEBUG] Job {job_id} moved to active jobs")
            
        except Exception as e:
            # debug stuff
            print(f"[ERROR] Error processing video job {job_id}: {e}")
            traceback.print_exc()
            error_job = {
                "status": "error",
                "error": str(e),
                "job_start_time": datetime.now().isoformat()
            }
            if job_id in self._pending_jobs:
                del self._pending_jobs[job_id]
            self._error_jobs[job_id] = error_job

    async def get_video_job_status(self, job_id: str) -> JobStatus:
        # Check if job is still pending
        if job_id in self._pending_jobs:
            pending_job = self._pending_jobs[job_id]
            return JobStatus(
                status="waiting",
                job_start_time=datetime.fromisoformat(pending_job["job_start_time"]),
                job_end_time=None,
                video_url=None,
            )
        
        # Check if job failed
        if job_id in self._error_jobs:
            error_job = self._error_jobs[job_id]
            return JobStatus(
                status="error",
                job_start_time=datetime.fromisoformat(error_job["job_start_time"]),
                job_end_time=None,
                video_url=None,
                error=error_job.get("error")
            )
        
        # Retrieve actual job from memory
        job = self._jobs.get(job_id)

        if job is None:  # if job not found
            return None

        # Use operation_name instead of full operation object
        result = await self.vertex_service.get_video_status_by_name(job["operation_name"])
        
        # Debug logging
        print(f"[DEBUG] Job {job_id} status: {result.status}")
        print(f"[DEBUG] Raw video URL from Vertex: {result.video_url}")

        video_url = None
        if result.video_url:
            video_url = result.video_url.replace("gs://", "https://storage.googleapis.com/")
            print(f"[DEBUG] Converted video URL: {video_url}")

        ret = JobStatus(
            status=result.status,
            job_start_time=datetime.fromisoformat(job["job_start_time"]),
            job_end_time=datetime.now() if result.status == "done" else None,
            video_url=video_url,
            metadata=job.get("metadata")
        )

        if result.status == "done":
            del self._jobs[job_id]  # clean from memory

        return ret

    async def redis_health_check(self) -> bool:
        """For MVP, always return True since we're using in-memory storage"""
        return True