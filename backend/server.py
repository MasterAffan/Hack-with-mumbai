from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils.env import settings
from services.vertex_service import VertexService

vertex_service = VertexService()

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
