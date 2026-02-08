import React, { useState } from "react";
import { Button, Flex, Tooltip, Spinner } from "@radix-ui/themes";
import { Eraser, Video } from "lucide-react";
import { Editor, createShapeId, AssetRecordType, TLImageAsset } from "tldraw";
import { toast } from "sonner";
import { useFrameGraphContext } from "../../contexts/FrameGraphContext";
import { apiFetch } from "../../utils/api";

interface CanvasToolbarProps {
  onClear: () => void;
  editorRef: React.RefObject<Editor | null>;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  onClear,
  editorRef,
}) => {
  const frameGraph = useFrameGraphContext();
  const [isMerging, setIsMerging] = useState(false);

  const handleMergeVideos = async () => {
    if (!editorRef.current) {
      toast.error("Editor not ready. Please wait a moment and try again.");
      return;
    }

    const editor = editorRef.current;

    // Reconstruct graph to ensure it's up-to-date with current canvas state
    frameGraph.reconstructGraph();

    // Get selected shapes
    const selectedIds = editor.getSelectedShapeIds();

    // Find the selected frame
    const selectedFrame = selectedIds
      .map((id) => editor.getShape(id))
      .find((shape) => shape?.type === "aspect-frame");

    if (!selectedFrame) {
      toast.error("Please select any frame in the chain to merge all its videos.");
      return;
    }

    // Walk up to find the root of this frame's chain
    const path = frameGraph.getFramePath(selectedFrame.id);
    if (path.length === 0) {
      toast.error("No chain found for the selected frame.");
      return;
    }
    const rootNode = path[0];

    // DFS traverse the entire chain from root, collecting all video URLs in order
    const videoUrls: string[] = [];
    const collectVideos = (frameId: typeof rootNode.frameId) => {
      const node = frameGraph.getFramePath(frameId).pop(); // get node itself
      if (!node) return;

      // Get all children of this node via descendants check
      const graphData = frameGraph.getGraph();
      const nodeData = graphData[frameId as string];
      if (!nodeData) return;

      const children: { index: number; frameId: string }[] = nodeData.children || [];
      // Sort children by branch index to maintain order
      const sorted = [...children].sort((a, b) => a.index - b.index);

      for (const child of sorted) {
        // Get the arrow connecting parent to this child
        const allShapes = editor.getCurrentPageShapes();
        const childFrame = allShapes.find((s) => s.id === child.frameId);
        if (!childFrame) continue;

        // Find the arrow that connects to this child
        const bindings = editor.getBindingsInvolvingShape(child.frameId as any);
        const incomingBinding = bindings.find(
          (b: any) => b.props.terminal === "end" && b.toId === child.frameId,
        );
        if (incomingBinding) {
          const arrow = editor.getShape(incomingBinding.fromId);
          if (arrow && arrow.type === "arrow") {
            const videoUrl = arrow.meta?.videoUrl as string | undefined;
            if (videoUrl && arrow.meta?.status === "done") {
              videoUrls.push(videoUrl);
            }
          }
        }

        // Recurse into this child's children
        collectVideos(child.frameId as any);
      }
    };

    collectVideos(rootNode.frameId);

    if (videoUrls.length === 0) {
      toast.error("No completed videos found in this chain. Generate videos first.");
      return;
    }

    if (videoUrls.length < 2) {
      toast.error("Need at least 2 completed videos in the chain to merge.");
      return;
    }

    // Call backend API to merge videos
    setIsMerging(true);
    const backendUrl = import.meta.env.VITE_BACKEND_URL;

    try {
      const response = await apiFetch(`${backendUrl}/api/jobs/video/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_urls: videoUrls }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }

      // Backend returns video bytes directly as blob
      const videoBlob = await response.blob();
      const mergedBlobUrl = window.URL.createObjectURL(videoBlob);

      // Get the selected frame's position and size for placing the new node
      const frameW = "w" in selectedFrame.props ? (selectedFrame.props.w as number) : 960;
      const frameH = "h" in selectedFrame.props ? (selectedFrame.props.h as number) : 540;
      const pageId = editor.getCurrentPageId();

      // Create new frame to the right of the selected frame (same line)
      const GAP = 2000;
      const newFrameId = createShapeId();
      const newFrameX = selectedFrame.x + frameW + GAP;
      const newFrameY = selectedFrame.y;

      editor.createShapes([
        {
          id: newFrameId,
          type: "aspect-frame",
          x: newFrameX,
          y: newFrameY,
          parentId: pageId,
          props: { w: frameW, h: frameH, name: "Merged Video" },
        },
      ]);

      // Create arrow from selected frame to new merged frame
      const arrowId = createShapeId();
      editor.createShapes([
        {
          id: arrowId,
          type: "arrow",
          parentId: pageId,
          props: {
            start: { x: selectedFrame.x + frameW, y: selectedFrame.y + frameH / 2 },
            end: { x: newFrameX, y: newFrameY + frameH / 2 },
          },
        },
      ]);

      editor.createBinding({ type: "arrow", fromId: arrowId, toId: selectedFrame.id, props: { terminal: "start", isPrecise: true } });
      editor.createBinding({ type: "arrow", fromId: arrowId, toId: newFrameId, props: { terminal: "end", isPrecise: true } });

      // Set arrow meta with merged video URL and status done — ArrowActionMenu will pick this up
      editor.updateShapes([
        {
          id: arrowId,
          type: "arrow",
          meta: {
            jobId: `merged-${Date.now()}`,
            status: "done",
            videoUrl: mergedBlobUrl,
            isMerged: true,
          },
        },
      ]);

      // Extract first frame from merged video as thumbnail for the new frame
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = mergedBlobUrl;
      video.onloadedmetadata = () => {
        video.currentTime = 0.5;
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string;
                const assetId = AssetRecordType.createId();
                const asset: TLImageAsset = {
                  id: assetId,
                  type: "image",
                  typeName: "asset",
                  props: {
                    name: "merged-video-thumb.png",
                    src: dataUrl,
                    w: video.videoWidth,
                    h: video.videoHeight,
                    mimeType: "image/png",
                    isAnimated: false,
                  },
                  meta: {},
                };
                editor.createAssets([asset]);

                const scale = Math.min(frameW / video.videoWidth, frameH / video.videoHeight);
                const scaledW = video.videoWidth * scale;
                const scaledH = video.videoHeight * scale;
                const imageX = (frameW - scaledW) / 2;
                const imageY = (frameH - scaledH) / 2;

                editor.createShapes([
                  {
                    id: createShapeId(),
                    type: "image",
                    parentId: newFrameId,
                    x: imageX,
                    y: imageY,
                    isLocked: true,
                    props: { assetId, w: scaledW, h: scaledH },
                  },
                ]);
              };
              reader.readAsDataURL(blob);
            }
          }, "image/png");
        }
      };

      // Reconstruct frame graph
      frameGraph.reconstructGraph();

      toast.success(`Merged all ${videoUrls.length} videos from the chain! Click the play button on the arrow to preview.`);
    } catch (error) {
      console.error("Error merging videos:", error);
      toast.error(
        `Failed to merge videos: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50">
      <Flex
        gap="3"
        p="2"
        className="rounded-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl bg-white/40"
      >
        <Tooltip content="Clear Canvas">
          <Button
            variant="surface"
            color="red"
            onClick={onClear}
            style={{
              cursor: "pointer",
              background: "rgba(255, 255, 255, 0.4)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
            className="hover:bg-white/60 transition-all"
          >
            <Eraser size={16} />
            Clear
          </Button>
        </Tooltip>

        <Tooltip content="Merge All Videos in the Chain (select any frame)">
          <Button
            variant="surface"
            color="green"
            onClick={handleMergeVideos}
            disabled={isMerging}
            style={{
              cursor: isMerging ? "not-allowed" : "pointer",
              background: "rgba(255, 255, 255, 0.4)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
            className="hover:bg-white/60 transition-all"
          >
            {isMerging ? <Spinner size="1" /> : <Video size={16} />}
            {isMerging ? "Merging..." : "Merge Videos"}
          </Button>
        </Tooltip>
      </Flex>
    </div>
  );
};
