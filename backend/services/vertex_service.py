class VertexService:
    async def generate_video(self, prompt: str, image_data: bytes = None, ending_image_data: bytes = None, duration_seconds: int = 6):
        print("Generating...")
        return {"operation_name": "mock-operation"}

    async def get_video_status_by_name(self, operation_name: str):
        return {"status": "waiting", "video_url": None}
