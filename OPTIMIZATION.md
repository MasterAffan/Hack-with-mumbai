# Krafity.ai — Optimization Strategy

## Overview

This document outlines the optimization strategies for reducing API costs, improving video generation speed, and introducing caching across the Krafity platform.

---

## 1. Cost Reduction

### Current Cost Per Video Generation

Each video generation currently triggers **3–4 API calls**:

| # | Call | Model | Purpose | Cost |
|---|------|-------|---------|------|
| 1 | `analyze_image_content` | `gemini-2.0-flash` | Detect animation annotations | Low |
| 2 | `_generate_image_raw` | `gemini-2.5-flash-image` | Clean starting image (remove text/annotations) | **Medium** |
| 3 | `generate_video_content` | `veo-3.1-fast-generate-001` | Generate video from image + prompt | **High** |
| 4 | `extract-context` (post-gen) | `gemini-2.0-flash` | Analyze generated video for scene context | Medium |

Additional optional calls:
- **Improve Frame** — `gemini-2.5-flash-image` (1 call per improve action)
- **Change Angle** — Hugging Face Gradio API (free, uses token rotation)

### Strategies

#### A. Skip Redundant Image Cleaning

**File:** `backend/services/job_service.py` → `_process_video_job()`

When a frame is already a "Generated Frame" (output of a previous video generation), it has no annotations to clean. The `_generate_image_raw` call is wasted.

**Fix:** Check the annotation analysis result first. If no annotations are detected, skip the image cleaning step and use the original image directly.

**Savings:** ~1 API call + 5–8 seconds per generation on clean frames.

#### B. Make `extract-context` Optional

**File:** `frontend/src/components/canvas/VideoGenerationManager.tsx`

Every completed video triggers a Gemini call to extract scene context (entities, environment, style). This is useful for multi-step storyboards but wasteful for standalone generations.

**Fix:** Only call `extract-context` when the user has global context enabled or when there's a downstream frame planned in the graph.

**Savings:** ~1 API call per video generation.

#### C. Shorter Video Duration Option

**File:** `backend/models/job.py` → `duration_seconds` default

Current default is 6 seconds. Veo pricing scales with duration.

**Fix:** Offer a 4-second "Quick" mode alongside the 6-second default. 4 seconds is often sufficient for storyboard clips.

**Savings:** ~33% reduction in Veo generation cost per clip.

#### D. Batch Annotation + Cleaning Decision

Instead of always running both annotation detection AND image cleaning in parallel, run annotation detection first. If the result indicates "no annotations found," skip cleaning entirely.

**Trade-off:** Adds ~2–3s latency (sequential instead of parallel) but saves 1 API call when no annotations exist. Net positive for clean frames.

---

## 2. Speed Optimization

### Current Bottlenecks

| Bottleneck | Location | Impact |
|-----------|----------|--------|
| Pre-processing (annotation + cleaning) | `job_service.py` | 5–10s before video gen starts |
| Veo generation | Vertex AI | 30–90s (cannot control) |
| Polling interval | `VideoGenerationManager.tsx` | Up to 2s delay after completion |
| Post-completion work | `VideoGenerationManager.tsx` | 5–15s (extract context + last frame) |

### Strategies

#### A. Adaptive Polling

**File:** `frontend/src/components/canvas/VideoGenerationManager.tsx`

Current: Fixed 2-second polling interval from the start.

**Fix:** Use adaptive intervals:
- **0–30s:** Poll every 5 seconds (Veo never finishes this fast)
- **30s+:** Poll every 2 seconds (video likely completing soon)

**Savings:** ~60% fewer polling API calls, no perceptible latency increase.

```typescript
// Adaptive polling logic
const elapsed = (Date.now() - jobStartTime) / 1000;
const pollInterval = elapsed < 30 ? 5000 : 2000;
```

#### B. Skip Cleaning for Generated Frames

**File:** `backend/services/job_service.py`

When the starting frame is already a generated/clean frame (no user-drawn annotations), skip the `_generate_image_raw` call.

**Savings:** 5–8 seconds off the pre-processing step.

#### C. Parallel Post-Completion

**File:** `frontend/src/components/canvas/VideoGenerationManager.tsx`

Currently, after video completes:
1. Fetch video blob → extract context (sequential)
2. Extract last frame from video (sequential)

**Fix:** Run context extraction and last-frame extraction in parallel.

**Savings:** 3–5 seconds off post-completion processing.

#### D. Preload Video for Frame Extraction

Start loading the video element as soon as the `done` status is received, before waiting for context extraction to complete.

---

## 3. Caching Strategy

### Current State: **No caching exists**

All API calls are made fresh every time, even for identical inputs.

### A. Image Hash Cache (Backend)

**Purpose:** Cache cleaned image results so repeat frames skip the `_generate_image_raw` call.

**Location:** `backend/services/job_service.py`

**Implementation:**
```python
import hashlib

class JobService:
    def __init__(self, vertex_service):
        self.vertex_service = vertex_service
        self._jobs = {}
        self._pending_jobs = {}
        self._error_jobs = {}
        # Caches
        self._cleaned_image_cache = {}   # sha256 -> cleaned image bytes
        self._annotation_cache = {}       # sha256 -> annotation description string
    
    def _hash_image(self, image_data: bytes) -> str:
        return hashlib.sha256(image_data).hexdigest()
    
    async def _get_cleaned_image(self, image_data: bytes) -> bytes:
        img_hash = self._hash_image(image_data)
        if img_hash in self._cleaned_image_cache:
            print(f"[CACHE HIT] Cleaned image for {img_hash[:12]}")
            return self._cleaned_image_cache[img_hash]
        
        cleaned = await self.vertex_service._generate_image_raw(
            prompt="Remove all text, captions, subtitles, annotations...",
            image=image_data
        )
        self._cleaned_image_cache[img_hash] = cleaned
        return cleaned
    
    async def _get_annotations(self, image_data: bytes) -> str:
        img_hash = self._hash_image(image_data)
        if img_hash in self._annotation_cache:
            print(f"[CACHE HIT] Annotations for {img_hash[:12]}")
            return self._annotation_cache[img_hash]
        
        desc = await self.vertex_service.analyze_image_content(
            prompt="Describe any animation annotations...",
            image_data=image_data
        )
        self._annotation_cache[img_hash] = desc
        return desc
```

**Savings:** 1–2 API calls per repeat frame, 5–10 seconds per cache hit.

### B. Annotation Cache (Backend)

Included in the Image Hash Cache above. Annotation descriptions are cached per image hash so the same frame analyzed twice returns instantly.

### C. Scene Context Cache (Frontend)

**Purpose:** Cache `extract-context` results per video URL to prevent duplicate Gemini calls on re-renders or page navigation.

**Location:** `frontend/src/components/canvas/VideoGenerationManager.tsx`

**Implementation:**
```typescript
const contextCacheRef = useRef<Map<string, any>>(new Map());

// Before calling extract-context:
const cachedContext = contextCacheRef.current.get(data.video_url);
if (cachedContext) {
    updateSceneState(cachedContext);
    // Skip the API call entirely
} else {
    const sceneResp = await apiFetch(`${backend_url}/api/gemini/extract-context`, { ... });
    // ... parse response
    contextCacheRef.current.set(data.video_url, extracted);
    updateSceneState(extracted);
}
```

**Savings:** 1 API call per duplicate video context extraction.

### D. Video Result Cache (Backend — Future)

For identical (image + prompt) combinations, cache the resulting video URL. This is the most aggressive cache and should only be used for exact matches.

```python
# Cache key: (image_hash, prompt_hash) -> video_url
self._video_result_cache = {}

cache_key = (self._hash_image(starting_frame), hashlib.sha256(prompt.encode()).hexdigest())
if cache_key in self._video_result_cache:
    return self._video_result_cache[cache_key]  # Return instantly
```

**Note:** This cache should have a TTL (time-to-live) since GCS URLs may expire.

---

## 4. Summary — Impact Matrix

| Optimization | Cost Saved | Time Saved | Effort |
|-------------|-----------|-----------|--------|
| Image hash cache | 1 API call/repeat | 5–8s/hit | Low |
| Skip cleaning (clean frames) | 1 API call | 5–8s | Low |
| Annotation cache | 1 API call/repeat | 2–3s/hit | Low |
| Adaptive polling | ~60% fewer polls | — | Low |
| Optional extract-context | 1 API call/gen | 3–5s | Low |
| 4s video option | ~33% Veo cost | — | Low |
| Scene context cache (FE) | 1 API call/dup | 3–5s | Low |
| Parallel post-completion | — | 3–5s | Medium |
| Video result cache | Full gen cost | 30–90s | Medium |

### Best-Case Scenario (All Optimizations)

- **First generation:** 3 API calls → same as today
- **Repeat frame, same prompt:** 3 API calls → **0 API calls** (fully cached)
- **Repeat frame, new prompt:** 3 API calls → **1 API call** (only Veo)
- **Clean frame (no annotations):** 3 API calls → **1 API call** (only Veo)
- **Polling overhead:** Reduced by ~60%
- **Post-completion latency:** Reduced by 3–5 seconds

---

## 5. Implementation Priority

1. **Image hash + annotation cache** — Biggest ROI, lowest effort
2. **Skip cleaning for generated frames** — Immediate speed + cost win
3. **Adaptive polling** — Reduces unnecessary backend load
4. **Scene context cache** — Prevents duplicate Gemini calls
5. **Optional extract-context** — Cost savings for simple workflows
6. **4s video duration option** — UI change + significant cost reduction
7. **Parallel post-completion** — Speed improvement
8. **Video result cache** — Most aggressive, highest savings for repeat work
