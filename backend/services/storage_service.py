from google.cloud import storage
from utils.env import settings
import os

class StorageService:
    def __init__(self):
        self.client = None
        self.bucket = None
        if settings.GOOGLE_CLOUD_BUCKET_NAME:
            try:
                from google.oauth2 import service_account
                credentials = None
                service_account_path = getattr(settings, 'GOOGLE_APPLICATION_CREDENTIALS', None) or os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
                if service_account_path and os.path.exists(service_account_path):
                    credentials = service_account.Credentials.from_service_account_file(service_account_path)
                if credentials:
                    self.client = storage.Client(project=settings.GOOGLE_CLOUD_PROJECT, credentials=credentials)
                else:
                    self.client = storage.Client(project=settings.GOOGLE_CLOUD_PROJECT)
                self.bucket = self.client.bucket(settings.GOOGLE_CLOUD_BUCKET_NAME)
            except Exception:
                self.client = None
                self.bucket = None

    async def upload_file(self, item_name: str, file_data: bytes):
        if not self.bucket:
            raise ValueError("Google Cloud Storage not configured")
        blob = self.bucket.blob(item_name)
        blob.upload_from_string(file_data)
        try:
            blob.make_public()
            return blob.public_url
        except Exception:
            bucket_name = self.bucket.name
            return f"https://storage.googleapis.com/{bucket_name}/{item_name}"

    def gcs_uri_to_public_url(self, uri: str) -> str:
        # gs://bucket/path -> https://storage.googleapis.com/bucket/path
        if not uri.startswith("gs://"):
            return uri
        without_scheme = uri[5:]
        parts = without_scheme.split("/", 1)
        bucket = parts[0]
        path = parts[1] if len(parts) > 1 else ""
        return f"https://storage.googleapis.com/{bucket}/{path}"
