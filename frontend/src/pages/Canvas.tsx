import { Tldraw, useEditor, createShapeId } from "tldraw";
import { useEffect, useState } from "react";
import { VideoGenerationManager } from "../components/canvas/VideoGenerationManager";
import { GeneratingDialog } from "../components/ui/GeneratingDialog";

function Toolbar() {
  const editor = useEditor();
  const [showDialog, setShowDialog] = useState(false);
  useEffect(() => { editor.setCurrentTool("select"); }, [editor]);
  async function startGeneration() {
    const frameA = createShapeId(); const frameB = createShapeId(); const arrowId = createShapeId();
    editor.createShapes([
      { id: frameA, type: "frame", x: 100, y: 100, props: { w: 480, h: 270, name: "Start" } },
      { id: frameB, type: "frame", x: 700, y: 100, props: { w: 480, h: 270, name: "Target" } },
    ]);
    editor.createShapes([{ id: arrowId, type: "arrow", x: 580, y: 235, props: { bend: 0 } } as any]);
    const bindings = editor.getBindingsInvolvingShape(arrowId);
    const startBinding = bindings.find((b: any) => b.props.terminal === "start");
    const endBinding = bindings.find((b: any) => b.props.terminal === "end");
    editor.updateShapes([{ id: arrowId, type: "arrow", meta: { status: "pending", startTime: Date.now() } }]);
    const backend = import.meta.env.VITE_API_BASE_URL || "";
    // Build a simple starting image blob from an HTML canvas
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = 960; tmpCanvas.height = 540;
    const ctx = tmpCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#efeef5"; ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = "#111827"; ctx.font = "bold 28px system-ui"; ctx.fillText("Krafity Start Frame", 40, 60);
    }
    const blob: Blob = await new Promise((resolve) => tmpCanvas.toBlob((b) => resolve(b as Blob), "image/png") as any);
    const fd = new FormData();
    fd.append("files", blob, "start.png");
    const last = Array.from(document.querySelectorAll("[data-last-frame]")).pop() as HTMLImageElement | undefined;
    if (last) {
      const resBlob = await fetch(last.src).then((r) => r.blob());
      fd.append("ending_image", resBlob, "end.png");
    }
    fd.append("global_context", "Simple scene");
    fd.append("custom_prompt", "Generate a short video transitioning from this frame");
    const res = await fetch(`${backend}/api/jobs/video`, { method: "POST", body: fd });
    const data = await res.json();
    editor.updateShapes([{ id: arrowId, type: "arrow", meta: { status: "pending", jobId: data.job_id, startTime: Date.now() } }]);
    setShowDialog(true);
  }
  return (
    <div className="absolute top-4 left-4 z-50">
      <button className="px-3 py-2 rounded bg-black text-white" onClick={startGeneration}>Start Mock Generation</button>
      {showDialog && <GeneratingDialog />}
    </div>
  );
}

export default function CanvasPage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: any) => setPreviewUrl(e.detail?.url || null);
    window.addEventListener("krafity:video-done", handler);
    return () => window.removeEventListener("krafity:video-done", handler);
  }, []);
  return (
    <div className="h-screen">
      <Toolbar />
      <Tldraw />
      <VideoGenerationManager />
      {previewUrl && (
        <div className="fixed bottom-4 left-4 bg-white/90 p-3 rounded shadow max-w-md">
          <div className="text-sm font-medium mb-2">Preview</div>
          <video controls src={previewUrl} className="w-full rounded" />
        </div>
      )}
    </div>
  );
}
