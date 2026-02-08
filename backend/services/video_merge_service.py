import asyncio
import subprocess
import time
from services.storage_service import StorageService
import uuid
import shutil

class VideoMergeService:
    def __init__(self, storage_service: StorageService):
        self.storage_service = storage_service
        # Check if ffmpeg is available
        self._check_ffmpeg()

    def _check_ffmpeg(self):
        """Check if ffmpeg is available in the system."""
        self.ffmpeg_available = shutil.which("ffmpeg") is not None
        if not self.ffmpeg_available:
            print("⚠️ FFmpeg not installed. Video merging will not be available.")
        else:
            print("✅ FFmpeg found. Video merging enabled.")

    async def merge_videos(self, video_urls: list[str], user_id: str) -> str:
        """
        Merges multiple videos from URLs into a single video using FFmpeg with HTTP inputs.
        This is the fastest approach - FFmpeg downloads and merges in one pass, no temporary files.
        
        Args:
            video_urls: List of video URLs in order (from root to end frame)
            user_id: User ID for organizing storage
            
        Returns:
            Public URL of the merged video
        """
        start_time = time.time()
        print(f"[VIDEO MERGE] Starting merge for user {user_id}: {len(video_urls)} videos")
        
        if not self.ffmpeg_available:
            raise ValueError("FFmpeg is not installed. Video merging is not available.")
        
        if not video_urls:
            raise ValueError("No video URLs provided")
        
        if len(video_urls) == 1:
            # Single video, just return the URL
            return video_urls[0]
        
        try:
            # Merge videos using FFmpeg with HTTP inputs directly
            merge_start = time.time()
            
            merged_video_data = await self._merge_with_ffmpeg_http(video_urls)
            
            merge_duration = time.time() - merge_start
            merged_size = len(merged_video_data)
            print(f"[VIDEO MERGE] FFmpeg merge took {merge_duration:.1f}s, output size: {merged_size} bytes")
            
            # Upload to storage (run in thread to avoid blocking event loop)
            upload_start = time.time()
            video_id = str(uuid.uuid4())
            video_path = f"videos/{user_id}/merged_{video_id}.mp4"
            
            print(f"[VIDEO MERGE] Uploading to GCS: {video_path}")
            public_url = await asyncio.to_thread(
                self._upload_sync, video_path, merged_video_data
            )
            
            upload_duration = time.time() - upload_start
            total_duration = time.time() - start_time
            print(f"[VIDEO MERGE] Upload took {upload_duration:.1f}s, total: {total_duration:.1f}s")
            print(f"[VIDEO MERGE] Merged video URL: {public_url}")
            
            return public_url
        except Exception as e:
            print(f"[VIDEO MERGE] Error: {e}")
            import traceback
            traceback.print_exc()
            raise

    async def merge_videos_bytes(self, video_urls: list[str]) -> bytes:
        """
        Merges multiple videos and returns the raw bytes directly (no GCS upload).
        """
        start_time = time.time()
        print(f"[VIDEO MERGE] Starting merge (bytes-only): {len(video_urls)} videos")
        
        if not self.ffmpeg_available:
            raise ValueError("FFmpeg is not installed. Video merging is not available.")
        
        if not video_urls:
            raise ValueError("No video URLs provided")
        
        merged_video_data = await self._merge_with_ffmpeg_http(video_urls)
        
        duration = time.time() - start_time
        print(f"[VIDEO MERGE] Merge complete in {duration:.1f}s, size: {len(merged_video_data)} bytes")
        
        return merged_video_data

    def _run_ffmpeg_sync(self, video_urls: list[str]) -> bytes:
        """
        Merges videos using FFmpeg via synchronous subprocess.run (Windows-compatible).
        Uses concat demuxer with piped stdin for the concat file list,
        and streams merged output to stdout.
        """
        concat_content = "".join([f"file '{url}'\n" for url in video_urls])
        concat_bytes = concat_content.encode('utf-8')

        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-protocol_whitelist", "file,http,https,tcp,tls,pipe",
            "-f", "concat",
            "-safe", "0",
            "-i", "pipe:0",
            "-c", "copy",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov",
            "pipe:1",
        ]

        print(f"[VIDEO MERGE] Running FFmpeg: {' '.join(ffmpeg_cmd)}")

        result = subprocess.run(
            ffmpeg_cmd,
            input=concat_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if result.returncode != 0:
            error_msg = result.stderr.decode(errors="replace") if result.stderr else "Unknown FFmpeg error"
            print(f"[VIDEO MERGE] FFmpeg stderr: {error_msg}")
            raise Exception(f"FFmpeg failed with return code {result.returncode}: {error_msg}")

        print(f"[VIDEO MERGE] FFmpeg finished, output size: {len(result.stdout)} bytes")
        return result.stdout

    def _upload_sync(self, video_path: str, video_data: bytes) -> str:
        """
        Synchronous GCS upload — called via asyncio.to_thread to avoid blocking the event loop.
        """
        bucket = self.storage_service.bucket
        if not bucket:
            raise ValueError("Google Cloud Storage not configured.")
        blob = bucket.blob(video_path)
        blob.upload_from_string(video_data, content_type="video/mp4")
        try:
            blob.make_public()
            return blob.public_url
        except Exception:
            bucket_name = bucket.name
            return f"https://storage.googleapis.com/{bucket_name}/{video_path}"

    async def _merge_with_ffmpeg_http(self, video_urls: list[str]) -> bytes:
        """
        Async wrapper that runs FFmpeg in a thread pool so it doesn't block the event loop.
        """
        return await asyncio.to_thread(self._run_ffmpeg_sync, video_urls)
