from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils.env import settings
from services.vertex_service import VertexService
from services.storage_service import StorageService
from services.job_service import JobService
from models.job import VideoJobRequest

vertex_service = VertexService()
storage_service = StorageService()
job_service = JobService(vertex_service=vertex_service, storage_service=storage_service)

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
async def create_video_job(
    files: UploadFile = File(...),
    ending_image: UploadFile | None = File(None),
    global_context: str = "",
    custom_prompt: str = "",
):
    starting_image_data = await files.read()
    ending_image_data = await ending_image.read() if ending_image else None
    data = VideoJobRequest(
        starting_image=starting_image_data,
        ending_image=ending_image_data,
        global_context=global_context,
        custom_prompt=custom_prompt,
    )
    job_id = await job_service.create_video_job(data)
    return {"job_id": job_id}

@app.get("/api/jobs/video/{job_id}")
async def get_video_job(job_id: str):
    status = await job_service.get_video_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    if status.status == "waiting":
        return JSONResponse(status_code=202, content={"status": "waiting"})
    if status.status == "error":
        return JSONResponse(status_code=500, content={"status": "error"})
    return {"status": "done", "video_url": status.video_url}

@app.post("/api/gemini/extract-context")
async def extract_context(video: UploadFile | None = File(None), image: UploadFile | None = File(None)):
    try:
        prompt = (
            "Extract structured scene information.\n"
            "Respond with ONLY valid JSON.\n"
            '{ "entities": [], "environment": "", "style": "" }'
        )
        if video:
            data = await video.read()
            res = vertex_service.analyze_video_content(prompt=prompt, video_data=data)
            raw = res.text or res.candidates[0].content.parts[0].text
        elif image:
            data = await image.read()
            raw = await vertex_service.analyze_image_content(prompt=prompt, image_data=data)
        else:
            raise HTTPException(status_code=400, detail="Provide video or image")
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        import json as pyjson
        try:
            return pyjson.loads(cleaned)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to parse JSON")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
