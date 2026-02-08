from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from services.storage_service import StorageService
from services.vertex_service import VertexService
from services.job_service import JobService
from services.video_merge_service import VideoMergeService
from utils.env import settings
from typing import Optional
import traceback
import time

# Initialize services
storage_service = StorageService()
vertex_service = VertexService()
job_service = JobService(vertex_service)
video_merge_service = VideoMergeService(storage_service)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Krafity.ai API starting...")
    print(f"   Project: {settings.GOOGLE_CLOUD_PROJECT}")
    print(f"   Location: {settings.GOOGLE_CLOUD_LOCATION}")
    yield
    # Shutdown
    print("👋 Krafity.ai API shutting down...")

app = FastAPI(
    title="Krafity.ai API",
    description="Video generation API powered by Vertex AI",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - Allow frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://krafity.pages.dev",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== Basic Routes ==============

@app.get("/")
def hello_world():
    return {"message": "Hello World - Krafity.ai API"}

@app.get("/test")
async def test_route():
    """Test Vertex AI connection"""
    try:
        result = await vertex_service.test_service()
        return {"status": "success", "response": str(result)}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ============== Jobs Routes ==============

@app.post("/api/jobs/video")
async def add_video_job(
    request: Request,
    files: UploadFile = File(...),
    ending_image: Optional[UploadFile] = File(None),
    global_context: str = Form(""),
    custom_prompt: str = Form("")
):
    """Start a video generation job"""
    starting_image_data = await files.read()
    ending_image_data = await ending_image.read() if ending_image else None
    
    from models.job import VideoJobRequest
    data = VideoJobRequest(
        starting_image=starting_image_data,
        ending_image=ending_image_data,
        global_context=global_context,
        custom_prompt=custom_prompt
    )
    
    job_id = await job_service.create_video_job(data)
    return {"job_id": job_id}


@app.get("/api/jobs/video/{job_id}")
async def get_video_job_status(job_id: str):
    """Get status of a video generation job"""
    job_status = await job_service.get_video_job_status(job_id)
    
    if not job_status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job_status.status == "error":
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error_message": job_status.error}
        )
    
    if job_status.status == "waiting":
        return JSONResponse(
            status_code=202,
            content={
                "status": "waiting",
                "job_start_time": job_status.job_start_time.isoformat()
            }
        )
    
    return {
        "status": job_status.status,
        "job_start_time": job_status.job_start_time.isoformat(),
        "job_end_time": job_status.job_end_time.isoformat() if job_status.job_end_time else None,
        "video_url": job_status.video_url,
        "metadata": job_status.metadata
    }


# Mock endpoints for testing
@app.post("/api/jobs/video/mock")
async def add_video_job_mock(
    request: Request,
    starting_image: UploadFile = File(...),
    global_context: str = Form(""),
    custom_prompt: str = Form("")
):
    """Mock video job for testing"""
    return {"job_id": "mock-job-id"}


@app.get("/api/jobs/video/mock/{job_id}")
async def get_video_job_status_mock(job_id: str):
    """Mock job status for testing"""
    return {
        "status": "done",
        "job_start_time": "2024-01-01T00:00:00",
        "job_end_time": "2024-01-01T00:00:30",
        "video_url": "https://storage.googleapis.com/hackwestern_bucket/videos/sample.mp4"
    }


@app.post("/api/jobs/video/merge")
async def merge_videos(request: Request):
    """Merge multiple videos into one and return the video bytes directly"""
    from fastapi.responses import StreamingResponse
    import io
    try:
        body = await request.json()
        video_urls = body.get("video_urls", [])
        
        if not video_urls or not isinstance(video_urls, list):
            raise HTTPException(status_code=400, detail="video_urls array is required")
        
        if len(video_urls) < 2:
            raise HTTPException(status_code=400, detail="At least 2 video URLs required")
        
        merged_video_data = await video_merge_service.merge_videos_bytes(video_urls)
        
        return StreamingResponse(
            io.BytesIO(merged_video_data),
            media_type="video/mp4",
            headers={
                "Content-Disposition": f"attachment; filename=merged-video-{int(time.time())}.mp4",
                "Content-Length": str(len(merged_video_data)),
            },
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============== Gemini Routes ==============

@app.post("/api/gemini/image")
async def generate_image(
    request: Request,
    image: UploadFile = File(...)
):
    """Improve/generate image using Gemini"""
    try:
        image_data = await image.read()
        
        prompt = "Improve the attached image and fill in any missing details. Do not deviate from the original art style too much, simply understand the artist's idea and enhance it a bit."
        
        result = await vertex_service.generate_image_content(
            prompt=prompt,
            image=image_data
        )
        
        return {"image_bytes": result}
        
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/gemini/extract-context")
async def extract_context(
    request: Request,
    video: UploadFile = File(...)
):
    """Extract context from video using Gemini"""
    try:
        video_data = await video.read()
        
        prompt = (
            "Extract structured scene information from this video.\n"
            "Respond with ONLY valid JSON. No explanations, no markdown, no backticks.\n"
            "Follow this exact structure, keys required:\n"
            "{\n"
            '  "entities": [\n'
            '    { "id": "id-1", "description": "...", "appearance": "..." }\n'
            "  ],\n"
            '  "environment": "...",\n'
            '  "style": "..."\n'
            "}\n"
            "If information is missing, use empty strings.\n"
        )
        
        import json as pyjson
        
        # Create a simple object to hold video data
        class VideoData:
            def __init__(self, data):
                self.data = data
        
        res = vertex_service.analyze_video_content(
            prompt=prompt,
            video_data=VideoData(video_data)
        )
        
        raw = res.text or res.candidates[0].content.parts[0].text
        
        # Strip markdown if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split('\n')
            cleaned = '\n'.join(lines[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        try:
            parsed = pyjson.loads(cleaned)
            return parsed
        except Exception:
            raise HTTPException(status_code=500, detail=f"Failed to parse JSON: {raw}")
        
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
