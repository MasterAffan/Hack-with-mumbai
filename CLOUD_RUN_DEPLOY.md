# Krafity Backend — Google Cloud Run Deployment Guide

> **All steps use Google Cloud Shell or the GCP Console GUI only. No local CLI required.**

---

## Prerequisites (What You Already Have)

- [x] Google Cloud project: `krafity-ritika`
- [x] GCS bucket: `krafityai-videos`
- [x] Vertex AI API enabled
- [x] Service account JSON key: `krafity-ritika-765949ba17e2.json`

---

## Table of Contents

1. [Open Cloud Shell](#1-open-cloud-shell)
2. [Upload Your Code to Cloud Shell](#2-upload-your-code-to-cloud-shell)
3. [Enable Required APIs](#3-enable-required-apis)
4. [Set Up Service Account Permissions](#4-set-up-service-account-permissions)
5. [Build & Push Docker Image](#5-build--push-docker-image)
6. [Deploy to Cloud Run](#6-deploy-to-cloud-run)
7. [Set Environment Variables](#7-set-environment-variables)
8. [Verify Deployment](#8-verify-deployment)
9. [Update Frontend to Use Cloud Run URL](#9-update-frontend-to-use-cloud-run-url)
10. [Redeploying After Code Changes](#10-redeploying-after-code-changes)
11. [Troubleshooting](#11-troubleshooting)
12. [Cost Estimates](#12-cost-estimates)

---

## 1. Open Cloud Shell

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Make sure your project `krafity-ritika` is selected in the top dropdown
3. Click the **Cloud Shell** icon (terminal icon `>_`) in the top-right toolbar
4. A terminal opens at the bottom of the page — this is your Cloud Shell

Verify you're in the right project:

```bash
gcloud config get-value project
```

If it doesn't say `krafity-ritika`, set it:

```bash
gcloud config set project krafity-ritika
```

---

## 2. Upload Your Code to Cloud Shell

### Option A: Upload ZIP via Cloud Shell (Recommended)

**On your local machine:**

1. Create a ZIP of the project containing:
   - `backend/` (entire folder)
   - `Dockerfile`
   - The service account JSON key (e.g. `krafity-ritika-765949ba17e2.json`)

2. In Cloud Shell, click the **three-dot menu (⋮)** at the top of the terminal → **Upload**
3. Upload the ZIP file

4. In Cloud Shell, unzip and navigate:

```bash
cd ~
unzip krafityupload.zip -d krafity
cd ~/krafity/krafityupload
```

### Option B: Clone from Git (if you have a repo)

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/krafity.git
cd krafity
```

### Verify your file structure

You should be in the directory that contains `Dockerfile` and `backend/`:

```bash
pwd
# Should show: /home/YOUR_USER/krafity/krafityupload  (or wherever your Dockerfile is)

ls
```

Expected output:
```
backend  Dockerfile  krafity-ritika-765949ba17e2.json
```

```bash
ls backend/
```

Expected output:
```
controllers  models  requirements.txt  server.py  services  utils  ...
```

### Create the `.dockerignore` file (IMPORTANT — may not be in your ZIP)

This file tells Docker to skip unnecessary files. Create it:

```bash
cat > .dockerignore << 'EOF'
__pycache__
*.pyc
.env
.git
.venv
venv
frontend
node_modules
*.md
*.json
!backend/requirements.txt
EOF
```

Verify it was created:

```bash
ls -la .dockerignore
cat .dockerignore
```

---

## 3. Enable Required APIs

Run these commands in Cloud Shell. They are idempotent (safe to run again):

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable aiplatform.googleapis.com
gcloud services enable storage.googleapis.com
```

Wait for each to complete (takes ~10-30 seconds each).

---

## 4. Set Up Service Account Permissions

Cloud Run uses a **service account** to authenticate with Vertex AI and GCS. By default it uses the **Compute Engine default service account**, but we'll create a dedicated one.

### 4A. Create a dedicated service account

```bash
gcloud iam service-accounts create krafity-backend \
  --display-name="Krafity Backend Service Account"
```

### 4B. Grant it the required roles

```bash
PROJECT_ID=krafity-ritika

# Vertex AI access (for Gemini, Veo, image generation)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:krafity-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Cloud Storage access (for reading/writing videos to bucket)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:krafity-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Allow Cloud Build to deploy as this service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:krafity-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### 4C. Make the GCS bucket publicly readable (for video URLs)

This allows the frontend to access generated video URLs directly:

```bash
gcloud storage buckets add-iam-policy-binding gs://krafityai-videos \
  --member="allUsers" \
  --role="roles/storage.objectViewer"
```

> **Note:** On Cloud Run, you do NOT need the service account JSON file. Cloud Run automatically provides credentials to the container via the metadata server. The `GOOGLE_APPLICATION_CREDENTIALS` env var is **not needed** in production.

---

## 5. Build & Push Docker Image

We'll use **Artifact Registry** (Google's container registry) to store the Docker image.

### 5A. Create an Artifact Registry repository (one-time)

```bash
gcloud artifacts repositories create krafity-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Krafity Docker images"
```

### 5B. Build the image using Cloud Build

This builds the Docker image in the cloud (no local Docker needed):

```bash
cd ~/krafity/krafityupload

gcloud builds submit \
  --tag us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest \
  --timeout=600
```

**What this does:**
- Uploads your code to Cloud Build
- Reads the `Dockerfile` and `.dockerignore`
- Builds the image (installs Python, FFmpeg, pip packages)
- Pushes the built image to Artifact Registry

**Expected output** (takes 3-5 minutes):
```
Creating temporary archive of X file(s)...
Uploading tarball...
...
DONE
-----------------------------------------------------------------
ID          CREATE_TIME                DURATION  SOURCE    STATUS
abcd1234    2026-02-08T06:00:00+00:00  3M20S    gs://...  SUCCESS
```

If it fails, check the error output. Common issues:
- Missing files → verify `Dockerfile` and `backend/` exist
- Permission denied → run the API enable commands from Step 3

---

## 6. Deploy to Cloud Run

```bash
gcloud run deploy krafity-backend \
  --image=us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest \
  --region=us-central1 \
  --platform=managed \
  --service-account=krafity-backend@krafity-ritika.iam.gserviceaccount.com \
  --min-instances=0 \
  --max-instances=5 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=600 \
  --concurrency=40 \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=krafity-ritika,GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_BUCKET_NAME=krafityai-videos,FRONTEND_URL=https://krafity.pages.dev"
```

### What each flag means:

| Flag | Value | Why |
|------|-------|-----|
| `--image` | Artifact Registry URL | The Docker image we just built |
| `--region` | `us-central1` | Same region as Vertex AI for low latency |
| `--service-account` | `krafity-backend@...` | The SA with Vertex AI + GCS permissions |
| `--min-instances=0` | 0 | Scale to zero when idle (saves cost) |
| `--max-instances=5` | 5 | Max 5 containers under load |
| `--memory=2Gi` | 2 GB | Enough for FFmpeg video merging |
| `--cpu=2` | 2 vCPUs | Enough for concurrent requests |
| `--timeout=600` | 10 minutes | Video generation can take 60-90s |
| `--concurrency=40` | 40 | Requests per container instance |
| `--no-cpu-throttling` | — | Keep CPU active even between requests (needed for background video gen tasks) |
| `--allow-unauthenticated` | — | Frontend can call the API without auth tokens |

### Expected output:

```
Deploying container to Cloud Run service [krafity-backend] in project [krafity-ritika] region [us-central1]
✓ Deploying... Done.
  ✓ Creating Revision...
  ✓ Routing traffic...
Done.
Service [krafity-backend] revision [krafity-backend-00001-abc] has been deployed and is serving 100% of traffic.
Service URL: https://krafity-backend-XXXXXXXXXX-uc.a.run.app
```

**Copy the Service URL** — this is your backend URL.

---

## 7. Set Environment Variables

The env vars were already set in the deploy command above. But if you need to update them later:

### Via Cloud Shell:

```bash
gcloud run services update krafity-backend \
  --region=us-central1 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=krafity-ritika,GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_BUCKET_NAME=krafityai-videos,FRONTEND_URL=https://krafity.pages.dev"
```

### Via GUI:

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click on `krafity-backend`
3. Click **Edit & Deploy New Revision**
4. Scroll down to **Variables & Secrets** tab
5. Add/edit environment variables:

| Variable | Value |
|----------|-------|
| `GOOGLE_CLOUD_PROJECT` | `krafity-ritika` |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` |
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` |
| `GOOGLE_CLOUD_BUCKET_NAME` | `krafityai-videos` |
| `FRONTEND_URL` | `https://krafity.pages.dev` |

6. Click **Deploy**

> **Important:** Do NOT set `GOOGLE_APPLICATION_CREDENTIALS`. On Cloud Run, authentication is handled automatically by the service account attached to the service.

---

## 8. Verify Deployment

### 8A. Health check

```bash
SERVICE_URL=$(gcloud run services describe krafity-backend --region=us-central1 --format='value(status.url)')
echo "Backend URL: $SERVICE_URL"

curl $SERVICE_URL/health
```

Expected: `{"status":"healthy"}`

### 8B. Root endpoint

```bash
curl $SERVICE_URL/
```

Expected: `{"message":"Hello World - Krafity.ai API"}`

### 8C. Test Vertex AI connection

```bash
curl $SERVICE_URL/test
```

Expected: `{"status":"success","response":"..."}`

### 8D. Check logs (if something fails)

```bash
gcloud run services logs read krafity-backend --region=us-central1 --limit=50
```

Or via GUI:
1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click `krafity-backend`
3. Click **Logs** tab

---

## 9. Update Frontend to Use Cloud Run URL

On your local machine (or wherever your frontend is deployed), update the `.env`:

```
VITE_BACKEND_URL=https://krafity-backend-XXXXXXXXXX-uc.a.run.app
```

Replace `XXXXXXXXXX` with your actual Cloud Run service hash.

If using Cloudflare Pages:
1. Go to Cloudflare Dashboard → Pages → `krafity`
2. Settings → Environment Variables
3. Add/update `VITE_BACKEND_URL` with the Cloud Run URL
4. Redeploy the frontend

---

## 10. Redeploying After Code Changes

When you update the backend code, you need to rebuild and redeploy.

### Step 1: Upload updated code to Cloud Shell

Upload the new ZIP or use `git pull` if using a repo.

### Step 2: Rebuild the image

```bash
cd ~/krafity/krafityupload

gcloud builds submit \
  --tag us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest \
  --timeout=600
```

### Step 3: Redeploy

```bash
gcloud run deploy krafity-backend \
  --image=us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest \
  --region=us-central1
```

> **Shortcut:** Steps 2 and 3 can be combined. Cloud Run will automatically pick up the new image if you use the same tag.

### One-liner for quick redeploy:

```bash
cd ~/krafity/krafityupload && \
gcloud builds submit --tag us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest --timeout=600 && \
gcloud run deploy krafity-backend --image=us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest --region=us-central1
```

---

## 11. Troubleshooting

### "Permission denied" on Vertex AI

The service account doesn't have `aiplatform.user` role. Fix:

```bash
gcloud projects add-iam-policy-binding krafity-ritika \
  --member="serviceAccount:krafity-backend@krafity-ritika.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

Then redeploy (env change triggers new revision):

```bash
gcloud run services update krafity-backend --region=us-central1 --set-env-vars="FORCE_REDEPLOY=$(date +%s)"
```

### "Could not initialize Google Cloud Storage"

The service account doesn't have storage access. Fix:

```bash
gcloud projects add-iam-policy-binding krafity-ritika \
  --member="serviceAccount:krafity-backend@krafity-ritika.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Container crashes on startup

Check logs:

```bash
gcloud run services logs read krafity-backend --region=us-central1 --limit=100
```

Common causes:
- **Missing env var** → check Step 7
- **Import error** → missing package in `requirements.txt`
- **Port mismatch** → Cloud Run expects port 8080 by default, but our Dockerfile uses 8000. Fix by adding `--port=8000`:

```bash
gcloud run services update krafity-backend \
  --region=us-central1 \
  --port=8000
```

### CORS errors from frontend

Make sure `FRONTEND_URL` env var matches your actual frontend URL. The backend CORS config uses this value. If your frontend is at `https://krafity.pages.dev`, that's what `FRONTEND_URL` should be.

Also verify `https://krafity.pages.dev` is in the CORS allow list in `server.py`.

### Video merge takes too long / times out

Increase timeout and memory:

```bash
gcloud run services update krafity-backend \
  --region=us-central1 \
  --timeout=900 \
  --memory=4Gi \
  --cpu=4
```

### Cold start is slow

Set minimum instances to 1 (costs ~$15-25/month):

```bash
gcloud run services update krafity-backend \
  --region=us-central1 \
  --min-instances=1
```

---

## 12. Cost Estimates

### Cloud Run Pricing (us-central1)

| Resource | Free Tier | After Free Tier |
|----------|-----------|-----------------|
| CPU | 180,000 vCPU-seconds/month | $0.00002400/vCPU-second |
| Memory | 360,000 GiB-seconds/month | $0.00000250/GiB-second |
| Requests | 2 million/month | $0.40/million |

### Estimated Monthly Cost

| Scenario | Min Instances | Estimated Cost |
|----------|--------------|----------------|
| Light use (< 50 videos/day) | 0 | **$0 - $5** (mostly free tier) |
| Medium use (50-200 videos/day) | 0 | **$5 - $20** |
| Always-on (min 1 instance) | 1 | **$15 - $40** |

### Other Costs

| Service | Cost |
|---------|------|
| Artifact Registry | ~$0.10/GB/month (image storage) |
| Cloud Build | 120 free build-minutes/day |
| GCS (video storage) | $0.020/GB/month |
| Vertex AI (Veo, Gemini) | Separate billing — this is your main cost |

---

## Quick Reference — Commands Cheat Sheet

```bash
# Check project
gcloud config get-value project

# Build image
gcloud builds submit --tag us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest --timeout=600

# Deploy
gcloud run deploy krafity-backend --image=us-central1-docker.pkg.dev/krafity-ritika/krafity-repo/krafity-backend:latest --region=us-central1

# Get service URL
gcloud run services describe krafity-backend --region=us-central1 --format='value(status.url)'

# View logs
gcloud run services logs read krafity-backend --region=us-central1 --limit=50

# Update env vars
gcloud run services update krafity-backend --region=us-central1 --set-env-vars="KEY=VALUE"

# Check running revisions
gcloud run revisions list --service=krafity-backend --region=us-central1

# Delete service (if needed)
gcloud run services delete krafity-backend --region=us-central1
```
