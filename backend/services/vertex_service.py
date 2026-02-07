import os
from google import genai
from google.genai.types import GenerateContentConfig, ImageConfig, Part, GenerateVideosConfig, GenerateVideosOperation, Image, VideoGenerationReferenceImage
from utils.env import settings

if settings.GOOGLE_APPLICATION_CREDENTIALS:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS

class VertexService:
    def __init__(self):
        self.client = genai.Client(
            vertexai=settings.GOOGLE_GENAI_USE_VERTEXAI,
            project=settings.GOOGLE_CLOUD_PROJECT,
            location=settings.GOOGLE_CLOUD_LOCATION,
        )
        self.bucket_name = settings.GOOGLE_CLOUD_BUCKET_NAME

    async def generate_image_content(self, prompt: str, image: bytes) -> str:
        import base64
        response = self.client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[
                Part.from_bytes(data=image, mime_type="image/png"),
                prompt,
            ],
            config=GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=ImageConfig(aspect_ratio="16:9"),
                candidate_count=1,
            ),
        )
        if not response.candidates or not response.candidates[0].content.parts:
            raise Exception(str(response))
        image_bytes = response.candidates[0].content.parts[0].inline_data.data
        return base64.b64encode(image_bytes).decode("utf-8")

    def analyze_video_content(self, prompt: str, video_data: bytes):
        return self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[Part.from_bytes(data=video_data, mime_type="video/mp4"), prompt],
        )

    async def analyze_image_content(self, prompt: str, image_data: bytes) -> str:
        return self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[Part.from_bytes(data=image_data, mime_type="image/png"), prompt],
        ).candidates[0].content.parts[0].text.strip()

    async def generate_video_content(self, prompt: str, image_data: bytes = None, ending_image_data: bytes = None, duration_seconds: int = 6) -> GenerateVideosOperation:
        ending_frame = None
        if ending_image_data:
            ending_frame = Image(image_bytes=ending_image_data, mime_type="image/png")
        operation = self.client.models.generate_videos(
            model="veo-3.1-fast-generate-001",
            prompt=prompt,
            image=Image(image_bytes=image_data, mime_type="image/png"),
            config=GenerateVideosConfig(
                aspect_ratio="16:9",
                duration_seconds=duration_seconds,
                output_gcs_uri=f"gs://{self.bucket_name}/videos/",
                negative_prompt="text,captions,subtitles,annotations,low quality,static",
                last_frame=ending_frame,
            ),
        )
        return operation

    async def get_video_status_by_name(self, operation_name: str) -> JobStatus:
        from models.job import JobStatus
        op = GenerateVideosOperation(name=operation_name)
        op = self.client.operations.get(op)
        if op.done and op.result and op.result.generated_videos:
            return JobStatus(status="done", job_start_time=datetime.utcnow(), video_url=op.result.generated_videos[0].video.uri)
        return JobStatus(status="waiting", job_start_time=datetime.utcnow(), video_url=None)
