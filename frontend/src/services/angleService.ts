import { Client } from "@gradio/client";

const HF_SPACE_ID =
  import.meta.env.VITE_HF_SPACE_ID ||
  "multimodalart/qwen-image-multiple-angles-3d-camera";

const HF_TOKENS: string[] = (import.meta.env.VITE_HF_TOKENS || "")
  .split(",")
  .map((t: string) => t.trim())
  .filter(Boolean);

let _currentTokenIndex = 0;
const _gradioClients = new Map<string, any>();

console.log(`[AngleService] Loaded ${HF_TOKENS.length} HF tokens`);

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

const AZIMUTH_STEPS = [0, 45, 90, 135, 180, 225, 270, 315];
const ELEVATION_STEPS = [-30, 0, 30, 60];
const DISTANCE_STEPS = [0.6, 1.0, 1.4];

export function snapToNearest(value: number, options: number[]): number {
  return options.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

export function snapAzimuth(value: number): number {
  return snapToNearest(value, AZIMUTH_STEPS);
}

export function snapElevation(value: number): number {
  return snapToNearest(value, ELEVATION_STEPS);
}

export function snapDistance(value: number): number {
  return snapToNearest(value, DISTANCE_STEPS);
}

export function getAzimuthLabel(deg: number): string {
  deg = ((deg % 360) + 360) % 360;
  if (deg <= 22.5 || deg > 337.5) return "Front";
  if (deg <= 67.5) return "Front-Right";
  if (deg <= 112.5) return "Right";
  if (deg <= 157.5) return "Back-Right";
  if (deg <= 202.5) return "Back";
  if (deg <= 247.5) return "Back-Left";
  if (deg <= 292.5) return "Left";
  return "Front-Left";
}

export function getElevationLabel(deg: number): string {
  if (deg <= -15) return "Low-angle";
  if (deg <= 15) return "Eye-level";
  if (deg <= 45) return "Elevated";
  return "High-angle";
}

export function getDistanceLabel(val: number): string {
  if (val <= 0.7) return "Close-up";
  if (val <= 1.1) return "Medium";
  return "Wide";
}

function isQuotaExhausted(err: unknown): boolean {
  const msg = formatError(err).toLowerCase();
  return (msg.includes("quota") && msg.includes("exceeded")) || msg.includes("quota exceeded");
}

function isRuntimeOOM(err: unknown): boolean {
  const msg = formatError(err).toLowerCase();
  return msg.includes("runtimeerror") || msg.includes("runtime error") || msg.includes("worker error");
}

async function getGradioClient(tokenIndex: number): Promise<any> {
  const token = HF_TOKENS[tokenIndex];
  if (!token) throw new Error("No HF tokens configured");
  if (_gradioClients.has(token)) return _gradioClients.get(token);
  const client = await Client.connect(HF_SPACE_ID, { token: token as `hf_${string}` });
  _gradioClients.set(token, client);
  return client;
}

function rotateToken(): void {
  _currentTokenIndex = (_currentTokenIndex + 1) % HF_TOKENS.length;
}

async function gradioPredict(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<any> {
  if (HF_TOKENS.length === 0) {
    throw new Error(
      "No HF tokens configured. Add VITE_HF_TOKENS to your .env file."
    );
  }

  let lastError: unknown = null;
  const totalTokens = HF_TOKENS.length;

  // Try every token one by one until one succeeds
  for (let attempt = 0; attempt < totalTokens; attempt++) {
    const idx = _currentTokenIndex % totalTokens;
    const tokenPreview = HF_TOKENS[idx].slice(0, 8) + "...";
    console.log(`[AngleService] Attempt ${attempt + 1}/${totalTokens} — token #${idx + 1} (${tokenPreview})`);

    try {
      const client = await getGradioClient(idx);
      const result = await client.predict(endpoint, payload);
      console.log(`[AngleService] ✓ Success with token #${idx + 1}`);
      return result;
    } catch (err) {
      lastError = err;
      const errStr = formatError(err);
      console.warn(`[AngleService] ✗ Token #${idx + 1} failed:`, errStr);

      // Clear cached client
      _gradioClients.delete(HF_TOKENS[idx]);

      if (isQuotaExhausted(err)) {
        // Token's daily quota is done — skip to next token immediately
        console.warn(`[AngleService] Token #${idx + 1} quota exhausted, skipping`);
        rotateToken();
        continue;
      }

      // For RuntimeError / OOM — don't burn other tokens on the same error
      // Just rotate and let the caller retry with smaller dimensions
      rotateToken();
    }
  }

  throw new Error(
    `All ${totalTokens} HF tokens failed. Last error: ${formatError(lastError)}`
  );
}

export interface AngleParams {
  azimuth: number;
  elevation: number;
  distance: number;
}

function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image dimensions"));
    };
    img.src = url;
  });
}

function clampDimensions(w: number, h: number, maxDim: number): { width: number; height: number } {
  let width = w;
  let height = h;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  // Ensure even dimensions
  width = width % 2 === 0 ? width : width - 1;
  height = height % 2 === 0 ? height : height - 1;
  return { width, height };
}

export async function generateAngleChange(
  imageBlob: Blob,
  params: AngleParams
): Promise<string> {
  const azimuth = snapAzimuth(params.azimuth);
  const elevation = snapElevation(params.elevation);
  const distance = snapDistance(params.distance);

  const dims = await getImageDimensions(imageBlob);

  // Try progressively smaller sizes if ZeroGPU runs out of memory
  const MAX_DIMS = [1024, 768, 512];

  let lastError: unknown = null;
  for (const maxDim of MAX_DIMS) {
    const { width, height } = clampDimensions(dims.width, dims.height, maxDim);
    console.log(`[AngleService] Input: ${dims.width}x${dims.height} → trying ${width}x${height} (max ${maxDim})`);

    try {
      const result = await gradioPredict("/infer_camera_edit", {
        image: imageBlob,
        azimuth,
        elevation,
        distance,
        seed: 0,
        randomize_seed: true,
        guidance_scale: 1.0,
        num_inference_steps: 4,
        height,
        width,
      });

      const outputUrl = result?.data?.[0]?.url;
      if (!outputUrl) {
        throw new Error("No image returned from angle generation API");
      }
      return outputUrl;
    } catch (err) {
      lastError = err;
      if (isRuntimeOOM(err)) {
        console.warn(`[AngleService] OOM at ${width}x${height}, retrying smaller...`);
        continue;
      }
      // Non-OOM error (e.g. all tokens exhausted) — don't retry smaller
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(formatError(lastError));
}

export { AZIMUTH_STEPS, ELEVATION_STEPS, DISTANCE_STEPS };
