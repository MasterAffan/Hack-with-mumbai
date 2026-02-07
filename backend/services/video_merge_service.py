import asyncio
import shutil
import uuid
import time
from services.storage_service import StorageService

class VideoMergeService:
    def __init__(self, storage_service: StorageService):
        self.storage_service = storage_service
        self.ffmpeg_available = shutil.which("ffmpeg") is not None

    async def merge_videos(self, video_urls: list[str], user_id: str) -> str:
        if not self.ffmpeg_available:
            raise ValueError("FFmpeg not installed")
        if not video_urls:
            raise ValueError("No video URLs provided")
        if len(video_urls) == 1:
            return video_urls[0]
        merged_video_data = await self._merge_with_ffmpeg_http(video_urls)
        video_id = str(uuid.uuid4())
        video_path = f"videos/{user_id}/merged_{video_id}.mp4"
        public_url = await self.storage_service.upload_file(video_path, merged_video_data)
        return public_url

    async def _merge_with_ffmpeg_http(self, video_urls: list[str]) -> bytes:
        concat_content = "".join([f"file '{url}'\n" for url in video_urls])
        concat_bytes = concat_content.encode("utf-8")
        ffmpeg_cmd = [
            "ffmpeg",
            "-protocol_whitelist", "file,http,https,tcp,tls,fd",
            "-f", "concat",
            "-safe", "0",
            "-i", "-",
            "-c", "copy",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov",
            "-",
        ]
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        async def write_concat():
            process.stdin.write(concat_bytes)
            await process.stdin.drain()
            process.stdin.close()
            await process.stdin.wait_closed()
        async def read_output():
            chunks = []
            while True:
                chunk = await process.stdout.read(1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks)
        async def read_err():
            while True:
                chunk = await process.stderr.read(1024)
                if not chunk:
                    break
        await write_concat()
        stdout_data = await read_output()
        return_code = await process.wait()
        if return_code != 0:
            raise Exception("FFmpeg failed")
        return stdout_data
