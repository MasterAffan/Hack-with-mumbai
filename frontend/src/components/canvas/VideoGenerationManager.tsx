import { useEditor, createShapeId, AssetRecordType, TLImageAsset } from "tldraw";
import { useEffect, useRef } from "react";
import { useGlobalContext } from "../../hooks/useGlobalContext";

export const VideoGenerationManager = () => {
  const editor = useEditor();
  const { updateSceneState, addClip, context } = useGlobalContext("global-context");
  const intervalsRef = useRef<Map<string, number>>(new Map());
  const completedJobsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const checkInterval = window.setInterval(() => {
      const arrows = editor.getCurrentPageShapes().filter((s) => s.type === "arrow" && s.meta?.jobId && s.meta?.status === "pending" && !completedJobsRef.current.has(s.meta.jobId as string));
      for (const arrow of arrows) {
        const jobId = arrow.meta.jobId as string;
        if (intervalsRef.current.has(jobId)) continue;
        const backend_url = import.meta.env.VITE_API_BASE_URL || "";
        const pollInterval = window.setInterval(async () => {
          try {
            const response = await fetch(`${backend_url}/api/jobs/video/${jobId}`);
            if (!response.ok && response.status !== 202 && response.status !== 200) {
              const intervalId = intervalsRef.current.get(jobId);
              if (intervalId) { window.clearInterval(intervalId); intervalsRef.current.delete(jobId); }
              return;
            }
            const data = await response.json();
            const currentArrow = editor.getCurrentPageShapes().find((s) => s.type === "arrow" && s.meta?.jobId === jobId);
            if (!currentArrow) {
              const intervalId = intervalsRef.current.get(jobId);
              if (intervalId) { window.clearInterval(intervalId); intervalsRef.current.delete(jobId); }
              return;
            }
            if (data.status === "done" && data.video_url) {
              completedJobsRef.current.add(jobId);
              const intervalId = intervalsRef.current.get(jobId);
              if (intervalId) { window.clearInterval(intervalId); intervalsRef.current.delete(jobId); }
              const doneMeta = { ...currentArrow.meta, status: "done", videoUrl: data.video_url };
              editor.updateShapes([{ id: currentArrow.id, type: "arrow", meta: doneMeta }]);
              (async () => {
                try {
                  const blob = await fetch(data.video_url).then((r) => r.blob());
                  const fd = new FormData(); fd.append("files", blob, "video.mp4");
                  const sceneResp = await fetch(`${backend_url}/api/gemini/extract-context`, { method: "POST", body: fd });
                  const responseText = await sceneResp.text();
                  if (sceneResp.ok) {
                    const latestArrow = editor.getShape(currentArrow.id);
                    const latestMeta = (latestArrow?.meta as any) ?? doneMeta;
                    try {
                      const extracted = JSON.parse(responseText);
                      updateSceneState(extracted);
                      addClip({ index: context?.clips.length ?? 0, clipUrl: data.video_url, lastFrameUrl: String(latestMeta.lastFrameUrl ?? ""), annotations: extracted, prompt: String(latestMeta.prompt ?? ""), modelParams: latestMeta.modelParams ?? {} });
                    } catch {}
                  }
                } catch {}
              })();
              const bindings = editor.getBindingsInvolvingShape(currentArrow.id);
              const endBinding = bindings.find((b: any) => b.fromId === currentArrow.id && b.props.terminal === "end");
              if (endBinding) {
                const targetFrameId = (endBinding as any).toId;
                const targetFrame = editor.getShape(targetFrameId);
                if (targetFrame && (targetFrame.type === "frame" || targetFrame.type === "aspect-frame")) {
                  const frameW = (targetFrame.props as any).w || 960;
                  const frameH = (targetFrame.props as any).h || 540;
                  editor.updateShapes([{ id: targetFrameId, type: targetFrame.type, isLocked: false, props: { ...targetFrame.props, name: "Generated Frame" } }]);
                  const videoUrl = data.video_url;
                  const video = document.createElement("video");
                  video.crossOrigin = "anonymous";
                  video.src = videoUrl;
                  video.onloadedmetadata = () => { video.currentTime = Math.max(0, video.duration - 0.1); };
                  video.onseeked = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                      ctx.drawImage(video, 0, 0);
                      canvas.toBlob((blob) => {
                        if (blob) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            const dataUrl = e.target?.result as string;
                            const refreshedArrow = editor.getShape(currentArrow.id);
                            const refreshedMeta = (refreshedArrow?.meta as any) ?? doneMeta;
                            editor.updateShapes([{ id: currentArrow.id, type: "arrow", meta: { ...refreshedMeta, lastFrameUrl: dataUrl } }]);
                            const assetId = AssetRecordType.createId();
                            const asset: TLImageAsset = { id: assetId, type: "image", typeName: "asset", props: { name: "last-frame.png", src: dataUrl, w: video.videoWidth, h: video.videoHeight, mimeType: "image/png", isAnimated: false }, meta: {} };
                            editor.createAssets([asset]);
                            const targetFrameChildren = editor.getSortedChildIdsForParent(targetFrameId);
                            const scale = Math.min(frameW / video.videoWidth, frameH / video.videoHeight);
                            const scaledW = video.videoWidth * scale; const scaledH = video.videoHeight * scale;
                            const imageX = (frameW - scaledW) / 2; const imageY = (frameH - scaledH) / 2;
                            const imageShapeId = createShapeId();
                            editor.createShapes([{ id: imageShapeId, type: "image", parentId: targetFrameId, x: imageX, y: imageY, isLocked: true, props: { assetId, w: scaledW, h: scaledH } }]);
                          };
                          reader.readAsDataURL(blob);
                        }
                      }, "image/png");
                    }
                  };
                }
              }
            } else {
              const startTime = (currentArrow.meta.startTime as number) || Date.now();
              const currentTime = Date.now();
              const seconds = Math.floor((currentTime - startTime) / 1000);
              const currentTimer = (currentArrow.meta.timer as number) || 0;
              if (currentTimer !== seconds) {
                editor.updateShapes([{ id: currentArrow.id, type: "arrow", meta: { ...currentArrow.meta, timer: seconds } }]);
              }
            }
          } catch {}
        }, 2000);
        intervalsRef.current.set(jobId, pollInterval);
      }
    }, 2000);
    return () => {
      if (checkInterval) window.clearInterval(checkInterval);
      intervalsRef.current.forEach((intervalId) => { window.clearInterval(intervalId); });
      intervalsRef.current.clear(); completedJobsRef.current.clear();
    };
  }, [editor]);
  return null;
};
