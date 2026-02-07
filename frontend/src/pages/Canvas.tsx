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
      { id: frameB, type: "frame", x: 700, y: 100, props: { w: 480, h: 270, name: "Target", isLocked: true } },
    ]);
    editor.createShapes([{ id: arrowId, type: "arrow", x: 580, y: 235, props: { bend: 0, start: { type: "binding" }, end: { type: "binding" } } }]);
    const bindings = editor.getBindingsInvolvingShape(arrowId);
    const startBinding = bindings.find((b: any) => b.props.terminal === "start");
    const endBinding = bindings.find((b: any) => b.props.terminal === "end");
    editor.updateShapes([{ id: arrowId, type: "arrow", meta: { status: "pending", startTime: Date.now() } }]);
    const backend = import.meta.env.VITE_API_BASE_URL || "";
    const res = await fetch(`${backend}/api/jobs/video`, { method: "POST" });
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
  return (
    <div className="h-screen">
      <Toolbar />
      <Tldraw />
      <VideoGenerationManager />
    </div>
  );
}
