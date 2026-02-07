from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils.env import settings

app = FastAPI(title="Krafity API", description="Day 1 backend skeleton", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Krafity API"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/api/jobs/video")
async def create_video_job(request: Request):
    return JSONResponse(status_code=202, content={"job_id": "mock-vid-job", "status": "accepted"})

@app.get("/api/jobs/video/{job_id}")
async def get_video_job(job_id: str):
    return {"job_id": job_id, "status": "waiting", "video_url": None}
