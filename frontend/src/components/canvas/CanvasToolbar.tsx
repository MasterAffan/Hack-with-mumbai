import React, { useState } from "react";
import { Button, Flex, Tooltip, Spinner } from "@radix-ui/themes";
import { Eraser, Video, TestTube2 } from "lucide-react";
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
      toast.error("Please select a frame to merge videos from.");
      return;
    }

    // Get the path from root to the selected frame (reverse traversal)
    const path = frameGraph.getFramePath(selectedFrame.id);

    if (path.length === 0) {
      toast.error("No path found for the selected frame.");
      return;
    }

    // Collect video URLs from arrows in the path
    // The path is ordered from root to selected frame, so videoUrls will be in correct order
    const videoUrls: string[] = [];

    // Traverse the path (skip the root frame, start from the first child)
    for (let i = 1; i < path.length; i++) {
      const node = path[i];

      // Get the arrow for this node
      if (node.arrowId) {
        const arrow = editor.getShape(node.arrowId);
        if (arrow && arrow.type === "arrow") {
          const videoUrl = arrow.meta?.videoUrl as string | undefined;
          if (videoUrl && arrow.meta?.status === "done") {
            videoUrls.push(videoUrl);
          }
        }
      }
    }

    if (videoUrls.length === 0) {
      toast.error("No videos found in the path from root to selected frame.");
      return;
    }

    if (videoUrls.length < 2) {
      toast.error("At least 2 videos are required for merging.");
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

      toast.success(`Merged ${videoUrls.length} videos! Click the play button on the arrow to preview, or right-click the frame to download.`);
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

        <Tooltip content="Seed 3 Demo Video Frames (Testing)">
          <Button
            variant="surface"
            color="violet"
            onClick={() => {
              if (!editorRef.current) {
                toast.error("Editor not ready.");
                return;
              }
              const ed = editorRef.current;
              const pageId = ed.getCurrentPageId();
              const FRAME_W = 960;
              const FRAME_H = 540;
              const GAP = 2000;
              const demoVideoUrl = `${window.location.origin}/demo/demo-1080p.mp4`;

              const frame1Id = createShapeId();
              const frame2Id = createShapeId();
              const frame3Id = createShapeId();
              const arrow1Id = createShapeId();
              const arrow2Id = createShapeId();

              const startX = 100;
              const startY = 300;

              // Create 3 frames in a line
              ed.createShapes([
                {
                  id: frame1Id,
                  type: "aspect-frame",
                  x: startX,
                  y: startY,
                  parentId: pageId,
                  props: { w: FRAME_W, h: FRAME_H, name: "Demo Frame 1" },
                },
                {
                  id: frame2Id,
                  type: "aspect-frame",
                  x: startX + FRAME_W + GAP,
                  y: startY,
                  parentId: pageId,
                  props: { w: FRAME_W, h: FRAME_H, name: "Demo Frame 2" },
                },
                {
                  id: frame3Id,
                  type: "aspect-frame",
                  x: startX + 2 * (FRAME_W + GAP),
                  y: startY,
                  parentId: pageId,
                  props: { w: FRAME_W, h: FRAME_H, name: "Demo Frame 3" },
                },
              ]);

              // Create arrows connecting frames
              ed.createShapes([
                {
                  id: arrow1Id,
                  type: "arrow",
                  parentId: pageId,
                  props: {
                    start: { x: startX + FRAME_W, y: startY + FRAME_H / 2 },
                    end: { x: startX + FRAME_W + GAP, y: startY + FRAME_H / 2 },
                  },
                },
                {
                  id: arrow2Id,
                  type: "arrow",
                  parentId: pageId,
                  props: {
                    start: { x: startX + FRAME_W + GAP + FRAME_W, y: startY + FRAME_H / 2 },
                    end: { x: startX + 2 * (FRAME_W + GAP), y: startY + FRAME_H / 2 },
                  },
                },
              ]);

              // Bind arrows to frames
              ed.createBinding({ type: "arrow", fromId: arrow1Id, toId: frame1Id, props: { terminal: "start", isPrecise: true } });
              ed.createBinding({ type: "arrow", fromId: arrow1Id, toId: frame2Id, props: { terminal: "end", isPrecise: true } });
              ed.createBinding({ type: "arrow", fromId: arrow2Id, toId: frame2Id, props: { terminal: "start", isPrecise: true } });
              ed.createBinding({ type: "arrow", fromId: arrow2Id, toId: frame3Id, props: { terminal: "end", isPrecise: true } });

              // Set arrow meta with demo video URL and status done
              ed.updateShapes([
                {
                  id: arrow1Id,
                  type: "arrow",
                  meta: { jobId: "demo-1", status: "done", videoUrl: demoVideoUrl },
                },
                {
                  id: arrow2Id,
                  type: "arrow",
                  meta: { jobId: "demo-2", status: "done", videoUrl: demoVideoUrl },
                },
              ]);

              // Reconstruct frame graph to pick up new frames
              frameGraph.reconstructGraph();

              toast.success("3 demo frames seeded with demo-1080p.mp4 video URLs. Select Frame 3 and click Merge Videos.");
            }}
            style={{
              cursor: "pointer",
              background: "rgba(255, 255, 255, 0.4)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
            className="hover:bg-white/60 transition-all"
          >
            <TestTube2 size={16} />
            Seed Demo
          </Button>
        </Tooltip>

        <Tooltip content="Merge Videos from Selected Frame">
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
