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

function isQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)) || "";
  return (
    msg.includes("GPU quota") ||
    msg.includes("exceeded") ||
    msg.includes("quota")
  );
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
  for (let attempts = 0; attempts < HF_TOKENS.length; attempts++) {
    const idx = _currentTokenIndex % HF_TOKENS.length;
    try {
      const client = await getGradioClient(idx);
      const result = await client.predict(endpoint, payload);
      return result;
    } catch (err) {
      lastError = err;
      if (isQuotaError(err)) {
        console.warn(`HF Token #${idx + 1} quota exceeded, rotating...`);
        _gradioClients.delete(HF_TOKENS[idx]);
        rotateToken();
      } else {
        throw err;
      }
    }
  }
  throw (
    lastError ||
    new Error(
      "All HF tokens have exceeded their GPU quota. Please try again later."
    )
  );
}

export interface AngleParams {
  azimuth: number;
  elevation: number;
  distance: number;
}

export async function generateAngleChange(
  imageBlob: Blob,
  params: AngleParams
): Promise<string> {
  const azimuth = snapAzimuth(params.azimuth);
  const elevation = snapElevation(params.elevation);
  const distance = snapDistance(params.distance);

  const result = await gradioPredict("/infer_camera_edit", {
    image: imageBlob,
    azimuth,
    elevation,
    distance,
    seed: 0,
    randomize_seed: true,
    guidance_scale: 1.0,
    num_inference_steps: 4,
    height: 1024,
    width: 1024,
  });

  const outputUrl = result?.data?.[0]?.url;
  if (!outputUrl) {
    throw new Error("No image returned from angle generation API");
  }

  return outputUrl;
}

export { AZIMUTH_STEPS, ELEVATION_STEPS, DISTANCE_STEPS };
