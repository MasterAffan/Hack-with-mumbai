# Krafity.ai — Google Cloud Deployment Guide

## Architecture

```
Frontend (Cloudflare Pages)          Backend (Google Cloud Run)
https://krafity.pages.dev  ──────>  https://krafity-backend-xxxxx.run.app
                                         │
                                         ├── Vertex AI (Veo 3.1, Gemini)
                                         ├── Google Cloud Storage (videos)
                                         └── FFmpeg (video merging)
```

---

## Prerequisites

1. **Google Cloud CLI** installed: https://cloud.google.com/sdk/docs/install
2. **Docker** installed (for local testing): https://docs.docker.com/get-docker/
3. **Google Cloud Project** with billing enabled
4. A **service account** JSON key file (or use default Cloud Run service account)

---

## Step 1: Google Cloud Project Setup

### 1.1 Login and set project

```bash
gcloud auth login
gcloud config set project krafity-ritika
```

### 1.2 Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  aiplatform.googleapis.com \
  storage.googleapis.com
```

### 1.3 Create GCS bucket (if not already created)

```bash
gsutil mb -l us-central1 gs://krafityai-videos
gsutil iam ch allUsers:objectViewer gs://krafityai-videos
```

The second command makes video files publicly readable (needed for frontend to play videos).

### 1.4 Grant Cloud Run service account permissions

The default Cloud Run service account needs access to Vertex AI and GCS:

```bash
PROJECT_NUMBER=$(gcloud projects describe krafity-ritika --format='value(projectNumber)')

# Vertex AI access
gcloud projects add-iam-policy-binding krafity-ritika \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# GCS access
gcloud projects add-iam-policy-binding krafity-ritika \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

---

## Step 2: Local Docker Testing

### 2.1 Build the image locally

```bash
cd C:\Users\Mahesh\Desktop\krafity
docker build -t krafity-backend .
```

### 2.2 Run locally with env vars

```bash
docker run -p 8000:8000 \
  -e GOOGLE_CLOUD_PROJECT=krafity-ritika \
  -e GOOGLE_CLOUD_LOCATION=us-central1 \
  -e GOOGLE_GENAI_USE_VERTEXAI=true \
  -e GOOGLE_CLOUD_BUCKET_NAME=krafityai-videos \
  -e FRONTEND_URL=http://localhost:5173 \
  -v C:\Users\Mahesh\Desktop\krafity\krafity-ritika-765949ba17e2.json:/app/credentials.json \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
  krafity-backend
```

### 2.3 Test it

```bash
curl http://localhost:8000/
# Should return: {"message":"Hello World - Krafity.ai API"}

curl http://localhost:8000/test
# Should return Vertex AI test response
```

---

## Step 3: Deploy to Cloud Run

You have **two options**: manual deploy or Cloud Build (CI/CD).

### Option A: Manual Deploy (Quick, Recommended for First Time)

#### 3A.1 Build and push image

```bash
cd C:\Users\Mahesh\Desktop\krafity

# Build
docker build -t gcr.io/krafity-ritika/krafity-backend:latest .

# Push to Google Container Registry
docker push gcr.io/krafity-ritika/krafity-backend:latest
```

> **Windows note:** If `docker push` fails with auth errors, run:
> ```bash
> gcloud auth configure-docker
> ```

#### 3A.2 Deploy to Cloud Run

```bash
gcloud run deploy krafity-backend \
  --image=gcr.io/krafity-ritika/krafity-backend:latest \
  --region=us-central1 \
  --platform=managed \
  --min-instances=0 \
  --max-instances=5 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=600 \
  --concurrency=40 \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=krafity-ritika,GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_BUCKET_NAME=krafityai-videos,FRONTEND_URL=https://krafity.pages.dev"
```

#### 3A.3 Get the deployed URL

```bash
gcloud run services describe krafity-backend --region=us-central1 --format='value(status.url)'
```

This will output something like:
```
https://krafity-backend-xxxxxxxxxx-uc.a.run.app
```

**Save this URL** — you need it for the frontend.

### Option B: Cloud Build (CI/CD, Automated)

#### 3B.1 Submit build

```bash
cd C:\Users\Mahesh\Desktop\krafity
gcloud builds submit --config=cloudbuild.yaml .
```

This will:
1. Build the Docker image
2. Push it to Container Registry
3. Deploy to Cloud Run with all env vars set

The `cloudbuild.yaml` uses `${PROJECT_ID}` which auto-resolves to `krafity-ritika`.

#### 3B.2 Get the deployed URL

Same as 3A.3 above.

---

## Step 4: Update Frontend on Cloudflare Pages

### 4.1 Set the backend URL

In your Cloudflare Pages dashboard:

1. Go to **krafity** project → **Settings** → **Environment variables**
2. Add/update:

| Variable | Value |
|----------|-------|
| `VITE_BACKEND_URL` | `https://krafity-backend-xxxxxxxxxx-uc.a.run.app` |

Replace the URL with the actual Cloud Run URL from Step 3.

### 4.2 Trigger a redeploy

Either push a new commit to trigger auto-deploy, or manually redeploy from the Cloudflare dashboard:

**Deployments** → **Retry deployment** on the latest build.

### 4.3 Verify

1. Open https://krafity.pages.dev/
2. Open browser DevTools → Network tab
3. Check that API calls go to your Cloud Run URL
4. Test video generation end-to-end

---

## Step 5: Verify Everything Works

### Health check

```bash
BACKEND_URL="https://krafity-backend-xxxxxxxxxx-uc.a.run.app"

# Basic health
curl $BACKEND_URL/

# Vertex AI connection
curl $BACKEND_URL/test

# CORS check (should include Access-Control-Allow-Origin)
curl -I -H "Origin: https://krafity.pages.dev" $BACKEND_URL/
```

### End-to-end test

1. Open https://krafity.pages.dev/
2. Create a frame, draw something
3. Click Generate → video should start generating
4. Wait for completion → video should appear on arrow
5. Test Merge Videos → merged video should appear as new frame

---

## Configuration Reference

### Environment Variables (Cloud Run)

| Variable | Value | Required |
|----------|-------|----------|
| `GOOGLE_CLOUD_PROJECT` | `krafity-ritika` | Yes |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Yes |
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` | Yes |
| `GOOGLE_CLOUD_BUCKET_NAME` | `krafityai-videos` | Yes |
| `FRONTEND_URL` | `https://krafity.pages.dev` | Yes |
| `GOOGLE_APPLICATION_CREDENTIALS` | *(not needed on Cloud Run — uses default SA)* | No |
| `REDIS_URL` | *(not used — in-memory storage)* | No |

### Environment Variables (Cloudflare Pages)

| Variable | Value |
|----------|-------|
| `VITE_BACKEND_URL` | `https://krafity-backend-xxxxx.run.app` |
| `VITE_SUPABASE_URL` | *(existing value)* |
| `VITE_SUPABASE_PUBLIC_KEY` | *(existing value)* |
| `VITE_HF_TOKENS` | *(existing comma-separated tokens)* |
| `VITE_HF_SPACE_ID` | `multimodalart/qwen-image-multiple-angles-3d-camera` |

### Cloud Run Settings Explained

| Setting | Value | Why |
|---------|-------|-----|
| `--memory=1Gi` | 1 GB RAM | FFmpeg video merging needs memory for buffering |
| `--cpu=1` | 1 vCPU | Sufficient since video gen is async (Vertex AI does the heavy work) |
| `--timeout=600` | 10 minutes | Video generation can take 1-2 minutes; merging needs time too |
| `--concurrency=40` | 40 requests/instance | Most requests are lightweight polling; actual gen is async |
| `--min-instances=0` | Scale to zero | Saves cost when idle (cold start ~5s) |
| `--max-instances=5` | Max 5 instances | Cost protection |
| `--no-cpu-throttling` | Keep CPU active | Needed for background async tasks (video gen polling) |
| `--allow-unauthenticated` | Public API | Frontend calls it directly from browser |

---

## Updating After Code Changes

### Backend changes only

```bash
cd C:\Users\Mahesh\Desktop\krafity

# Option A: Manual
docker build -t gcr.io/krafity-ritika/krafity-backend:latest .
docker push gcr.io/krafity-ritika/krafity-backend:latest
gcloud run deploy krafity-backend \
  --image=gcr.io/krafity-ritika/krafity-backend:latest \
  --region=us-central1

# Option B: Cloud Build
gcloud builds submit --config=cloudbuild.yaml .
```

### Frontend changes only

Push to your GitHub repo connected to Cloudflare Pages — it auto-deploys.

---

## Troubleshooting

### "CORS error" in browser console

- Check that `FRONTEND_URL` env var on Cloud Run is set to `https://krafity.pages.dev`
- Verify CORS middleware in `server.py` includes your frontend URL

### "500 Internal Server Error" on video generation

- Check Cloud Run logs: `gcloud run services logs read krafity-backend --region=us-central1`
- Common cause: service account lacks `aiplatform.user` role

### "FFmpeg not found" during merge

- FFmpeg is installed in the Docker image via `apt-get install ffmpeg`
- If you see this error, the Docker image may not have built correctly

### Cold start takes too long

- Set `--min-instances=1` to keep one instance warm (costs ~$10-15/month)
- Or accept the ~5s cold start on first request after idle

### Videos not accessible (403 on GCS URLs)

- Run: `gsutil iam ch allUsers:objectViewer gs://krafityai-videos`
- This makes the bucket publicly readable

---

## Cost Estimate (Google Cloud)

| Service | Usage | Estimated Cost |
|---------|-------|---------------|
| Cloud Run | ~1000 requests/day, scale to zero | ~$5-15/month |
| Vertex AI (Veo 3.1) | Per video generated | ~$0.35/video (6s) |
| Vertex AI (Gemini Flash) | Per API call | ~$0.001/call |
| Cloud Storage | Video storage | ~$0.02/GB/month |
| Cloud Build | Per build | ~$0.003/build-minute |

**Total estimated:** $20-50/month depending on usage (excluding Veo generation costs which scale with usage).
