import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Download, Loader2 } from "lucide-react";
import * as THREE from "three";
import {
  generateAngleChange,
  getAzimuthLabel,
  getElevationLabel,
  getDistanceLabel,
  AZIMUTH_STEPS,
  ELEVATION_STEPS,
  DISTANCE_STEPS,
  snapToNearest,
} from "../../services/angleService";

interface AngleChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageDataUrl: string | null;
  onApply: (newImageDataUrl: string) => void;
}

interface CameraState {
  azimuth: number;
  elevation: number;
  distance: number;
}

export const AngleChangeModal: React.FC<AngleChangeModalProps> = ({
  isOpen,
  onClose,
  imageDataUrl,
  onApply,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneObjRef = useRef<{
    updatePositions: () => void;
    updateImage: (url: string | null) => void;
  } | null>(null);
  const animFrameRef = useRef<number>(0);

  const [camera, setCamera] = useState<CameraState>({
    azimuth: 0,
    elevation: 0,
    distance: 1.0,
  });
  const cameraRef = useRef<CameraState>(camera);
  cameraRef.current = camera;

  const [isGenerating, setIsGenerating] = useState(false);
  const [outputImageUrl, setOutputImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateCamera = useCallback((partial: Partial<CameraState>) => {
    setCamera((prev) => {
      const next = { ...prev, ...partial };
      cameraRef.current = next;
      return next;
    });
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Prevent double-init
    if (rendererRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111118);

    const cam = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cam.position.set(4, 3.5, 4);
    cam.lookAt(0, 0.3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0x4a7aff, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(5, 20, 0x1a1a2e, 0x12121a);
    grid.position.y = -0.01;
    scene.add(grid);

    const CENTER = new THREE.Vector3(0, 0.5, 0);
    const AZIMUTH_RADIUS = 1.8;
    const ELEVATION_RADIUS = 1.4;
    const ELEV_ARC_X = -0.8;

    // Subject plane
    const planeGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x3a3a4a,
      side: THREE.DoubleSide,
    });
    const imagePlane = new THREE.Mesh(planeGeo, planeMat);
    imagePlane.position.copy(CENTER);
    scene.add(imagePlane);

    const frameGeo = new THREE.EdgesGeometry(planeGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0x0047ab });
    const imageFrame = new THREE.LineSegments(frameGeo, frameMat);
    imageFrame.position.copy(CENTER);
    scene.add(imageFrame);

    // Glow ring
    const glowRingGeo = new THREE.RingGeometry(0.55, 0.58, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0x0047ab,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.position.set(0, 0.01, 0);
    glowRing.rotation.x = -Math.PI / 2;
    scene.add(glowRing);

    // Camera indicator
    const camGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
    const camMat = new THREE.MeshStandardMaterial({
      color: 0x0047ab,
      emissive: 0x0047ab,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });
    const cameraIndicator = new THREE.Mesh(camGeo, camMat);
    scene.add(cameraIndicator);

    const camGlowGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const camGlowMat = new THREE.MeshBasicMaterial({
      color: 0x3377ff,
      transparent: true,
      opacity: 0.8,
    });
    const camGlow = new THREE.Mesh(camGlowGeo, camGlowMat);
    scene.add(camGlow);

    // Azimuth ring
    const azRingGeo = new THREE.TorusGeometry(AZIMUTH_RADIUS, 0.04, 16, 100);
    const azRingMat = new THREE.MeshBasicMaterial({
      color: 0x0047ab,
      transparent: true,
      opacity: 0.7,
    });
    const azimuthRing = new THREE.Mesh(azRingGeo, azRingMat);
    azimuthRing.rotation.x = Math.PI / 2;
    azimuthRing.position.y = 0.02;
    scene.add(azimuthRing);

    // Azimuth handle
    const azHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const azHandleMat = new THREE.MeshStandardMaterial({
      color: 0x0047ab,
      emissive: 0x0047ab,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4,
    });
    const azimuthHandle = new THREE.Mesh(azHandleGeo, azHandleMat);
    scene.add(azimuthHandle);

    const azGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const azGlowMat = new THREE.MeshBasicMaterial({
      color: 0x0047ab,
      transparent: true,
      opacity: 0.2,
    });
    const azGlow = new THREE.Mesh(azGlowGeo, azGlowMat);
    scene.add(azGlow);

    // Elevation arc
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = ((-30 + (90 * i) / 32) * Math.PI) / 180;
      arcPoints.push(
        new THREE.Vector3(
          ELEV_ARC_X,
          ELEVATION_RADIUS * Math.sin(angle) + CENTER.y,
          ELEVATION_RADIUS * Math.cos(angle)
        )
      );
    }
    const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
    const elArcGeo = new THREE.TubeGeometry(arcCurve, 32, 0.04, 8, false);
    const elArcMat = new THREE.MeshBasicMaterial({
      color: 0x00ffd0,
      transparent: true,
      opacity: 0.8,
    });
    scene.add(new THREE.Mesh(elArcGeo, elArcMat));

    // Elevation handle
    const elHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const elHandleMat = new THREE.MeshStandardMaterial({
      color: 0x00ffd0,
      emissive: 0x00ffd0,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4,
    });
    const elevationHandle = new THREE.Mesh(elHandleGeo, elHandleMat);
    scene.add(elevationHandle);

    const elGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const elGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffd0,
      transparent: true,
      opacity: 0.2,
    });
    const elGlow = new THREE.Mesh(elGlowGeo, elGlowMat);
    scene.add(elGlow);

    // Distance handle
    const distHandleGeo = new THREE.SphereGeometry(0.15, 32, 32);
    const distHandleMat = new THREE.MeshStandardMaterial({
      color: 0xffb800,
      emissive: 0xffb800,
      emissiveIntensity: 0.7,
      metalness: 0.5,
      roughness: 0.3,
    });
    const distanceHandle = new THREE.Mesh(distHandleGeo, distHandleMat);
    scene.add(distanceHandle);

    const distGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const distGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffb800,
      transparent: true,
      opacity: 0.25,
    });
    const distGlow = new THREE.Mesh(distGlowGeo, distGlowMat);
    scene.add(distGlow);

    // Distance line
    let distanceTube: THREE.Mesh | null = null;
    function updateDistanceLine(start: THREE.Vector3, end: THREE.Vector3) {
      if (distanceTube) scene.remove(distanceTube);
      const path = new THREE.LineCurve3(start, end);
      const tubeGeo = new THREE.TubeGeometry(path, 1, 0.025, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0xffb800,
        transparent: true,
        opacity: 0.8,
      });
      distanceTube = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(distanceTube);
    }

    // Guide lines
    const verticalGuideGeo = new THREE.BufferGeometry();
    const verticalGuideMat = new THREE.LineDashedMaterial({
      color: 0x0047ab,
      dashSize: 0.1,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.6,
    });
    const verticalGuide = new THREE.Line(verticalGuideGeo, verticalGuideMat);
    scene.add(verticalGuide);

    const horizontalGuideGeo = new THREE.BufferGeometry();
    const horizontalGuideMat = new THREE.LineDashedMaterial({
      color: 0x0047ab,
      dashSize: 0.1,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.6,
    });
    const horizontalGuide = new THREE.Line(
      horizontalGuideGeo,
      horizontalGuideMat
    );
    scene.add(horizontalGuide);

    const groundMarkerGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const groundMarkerMat = new THREE.MeshBasicMaterial({
      color: 0x0047ab,
      transparent: true,
      opacity: 0.7,
    });
    const groundMarker = new THREE.Mesh(groundMarkerGeo, groundMarkerMat);
    scene.add(groundMarker);

    // Update visuals
    function updateVisuals() {
      const st = cameraRef.current;
      const azRad = (st.azimuth * Math.PI) / 180;
      const elRad = (st.elevation * Math.PI) / 180;
      const visualDist = 0.8 + ((st.distance - 0.6) / 0.8) * 1.6;

      const camX = visualDist * Math.sin(azRad) * Math.cos(elRad);
      const camY = CENTER.y + visualDist * Math.sin(elRad);
      const camZ = visualDist * Math.cos(azRad) * Math.cos(elRad);

      cameraIndicator.position.set(camX, camY, camZ);
      cameraIndicator.lookAt(CENTER);
      cameraIndicator.rotateX(Math.PI / 2);
      camGlow.position.copy(cameraIndicator.position);

      const azX = AZIMUTH_RADIUS * Math.sin(azRad);
      const azZ = AZIMUTH_RADIUS * Math.cos(azRad);
      azimuthHandle.position.set(azX, 0.16, azZ);
      azGlow.position.copy(azimuthHandle.position);

      const elY = CENTER.y + ELEVATION_RADIUS * Math.sin(elRad);
      const elZ = ELEVATION_RADIUS * Math.cos(elRad);
      elevationHandle.position.set(ELEV_ARC_X, elY, elZ);
      elGlow.position.copy(elevationHandle.position);

      const distT = 0.15 + ((st.distance - 0.6) / 0.8) * 0.7;
      distanceHandle.position.lerpVectors(
        CENTER,
        cameraIndicator.position,
        distT
      );
      distGlow.position.copy(distanceHandle.position);

      updateDistanceLine(CENTER.clone(), cameraIndicator.position.clone());

      const groundProjection = new THREE.Vector3(camX, 0.05, camZ);
      groundMarker.position.copy(groundProjection);

      verticalGuideGeo.setFromPoints([
        cameraIndicator.position.clone(),
        groundProjection.clone(),
      ]);
      verticalGuide.computeLineDistances();

      const centerGround = new THREE.Vector3(0, 0.05, 0);
      horizontalGuideGeo.setFromPoints([
        groundProjection.clone(),
        centerGround.clone(),
      ]);
      horizontalGuide.computeLineDistances();

      glowRing.rotation.z += 0.005;
    }

    updateVisuals();

    // Raycaster interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragTarget: string | null = null;
    let hoveredHandle: {
      mesh: THREE.Mesh;
      glow: THREE.Mesh;
      name: string;
    } | null = null;

    function getMousePos(event: MouseEvent | Touch) {
      const rect = renderer.domElement.getBoundingClientRect();
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function setHandleScale(
      handle: THREE.Mesh,
      glow: THREE.Mesh | null,
      scale: number
    ) {
      handle.scale.setScalar(scale);
      if (glow) glow.scale.setScalar(scale);
    }

    const handles = [
      { mesh: azimuthHandle, glow: azGlow, name: "azimuth" },
      { mesh: elevationHandle, glow: elGlow, name: "elevation" },
      { mesh: distanceHandle, glow: distGlow, name: "distance" },
    ];

    function onPointerDown(event: MouseEvent) {
      getMousePos(event);
      raycaster.setFromCamera(mouse, cam);
      for (const h of handles) {
        if (raycaster.intersectObject(h.mesh).length > 0) {
          isDragging = true;
          dragTarget = h.name;
          setHandleScale(h.mesh, h.glow, 1.3);
          renderer.domElement.style.cursor = "grabbing";
          return;
        }
      }
    }

    function onPointerMove(event: MouseEvent) {
      getMousePos(event);
      raycaster.setFromCamera(mouse, cam);

      if (!isDragging) {
        let foundHover: (typeof handles)[0] | null = null;
        for (const h of handles) {
          if (raycaster.intersectObject(h.mesh).length > 0) {
            foundHover = h;
            break;
          }
        }
        if (hoveredHandle && hoveredHandle !== foundHover) {
          setHandleScale(hoveredHandle.mesh, hoveredHandle.glow, 1.0);
        }
        if (foundHover) {
          setHandleScale(foundHover.mesh, foundHover.glow, 1.15);
          renderer.domElement.style.cursor = "grab";
          hoveredHandle = foundHover;
        } else {
          renderer.domElement.style.cursor = "default";
          hoveredHandle = null;
        }
        return;
      }

      const plane = new THREE.Plane();
      const intersect = new THREE.Vector3();

      if (dragTarget === "azimuth") {
        plane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 0)
        );
        if (raycaster.ray.intersectPlane(plane, intersect)) {
          let angle =
            Math.atan2(intersect.x, intersect.z) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          updateCamera({ azimuth: Math.round(Math.max(0, Math.min(360, angle))) });
          updateVisuals();
        }
      } else if (dragTarget === "elevation") {
        const elevPlane = new THREE.Plane(
          new THREE.Vector3(1, 0, 0),
          -ELEV_ARC_X
        );
        if (raycaster.ray.intersectPlane(elevPlane, intersect)) {
          const relY = intersect.y - CENTER.y;
          const relZ = intersect.z;
          let angle = Math.atan2(relY, relZ) * (180 / Math.PI);
          angle = Math.max(-30, Math.min(60, angle));
          updateCamera({ elevation: Math.round(angle) });
          updateVisuals();
        }
      } else if (dragTarget === "distance") {
        const newDist = 1.0 + mouse.y * 0.4;
        updateCamera({
          distance:
            Math.round(Math.max(0.6, Math.min(1.4, newDist)) * 10) / 10,
        });
        updateVisuals();
      }
    }

    function onPointerUp() {
      if (isDragging) {
        handles.forEach((h) => setHandleScale(h.mesh, h.glow, 1.0));
      }
      isDragging = false;
      dragTarget = null;
      renderer.domElement.style.cursor = "default";
    }

    renderer.domElement.addEventListener("mousedown", onPointerDown);
    renderer.domElement.addEventListener("mousemove", onPointerMove);
    renderer.domElement.addEventListener("mouseup", onPointerUp);
    renderer.domElement.addEventListener("mouseleave", onPointerUp);

    // Touch support
    renderer.domElement.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        onPointerDown({
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY,
        } as MouseEvent);
      },
      { passive: false }
    );
    renderer.domElement.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        onPointerMove({
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY,
        } as MouseEvent);
      },
      { passive: false }
    );
    renderer.domElement.addEventListener("touchend", onPointerUp);

    // Animation loop
    let time = 0;
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      time += 0.01;
      camGlow.scale.setScalar(1 + Math.sin(time * 2) * 0.03);
      glowRing.rotation.z += 0.003;
      updateVisuals();
      renderer.render(scene, cam);
    }
    animate();

    // Resize
    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    // Public API
    sceneObjRef.current = {
      updatePositions: updateVisuals,
      updateImage: (url: string | null) => {
        if (url) {
          const img = new Image();
          if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
          img.onload = () => {
            const tex = new THREE.Texture(img);
            tex.needsUpdate = true;
            tex.colorSpace = THREE.SRGBColorSpace;
            planeMat.map = tex;
            planeMat.color.set(0xffffff);
            planeMat.needsUpdate = true;
            const ar = img.width / img.height;
            const maxSize = 1.5;
            if (ar > 1) {
              imagePlane.scale.set(maxSize, maxSize / ar, 1);
              imageFrame.scale.set(maxSize, maxSize / ar, 1);
            } else {
              imagePlane.scale.set(maxSize * ar, maxSize, 1);
              imageFrame.scale.set(maxSize * ar, maxSize, 1);
            }
          };
          img.src = url;
        } else {
          planeMat.map = null;
          planeMat.color.set(0x3a3a4a);
          planeMat.needsUpdate = true;
          imagePlane.scale.set(1, 1, 1);
          imageFrame.scale.set(1, 1, 1);
        }
      },
    };

    // Load initial image
    if (imageDataUrl) {
      sceneObjRef.current.updateImage(imageDataUrl);
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousedown", onPointerDown);
      renderer.domElement.removeEventListener("mousemove", onPointerMove);
      renderer.domElement.removeEventListener("mouseup", onPointerUp);
      renderer.domElement.removeEventListener("mouseleave", onPointerUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneObjRef.current = null;
    };
  }, [isOpen, imageDataUrl, updateCamera]);

  // Handle generate
  const handleGenerate = async () => {
    if (!imageDataUrl) return;
    setIsGenerating(true);
    setError(null);
    setOutputImageUrl(null);

    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();

      const resultUrl = await generateAngleChange(blob, {
        azimuth: camera.azimuth,
        elevation: camera.elevation,
        distance: camera.distance,
      });

      setOutputImageUrl(resultUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle apply — downloads the generated image and passes it back as data URL
  const handleApply = async () => {
    if (!outputImageUrl) return;
    try {
      const response = await fetch(outputImageUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        onApply(dataUrl);
        handleClose();
      };
      reader.readAsDataURL(blob);
    } catch {
      setError("Failed to apply image");
    }
  };

  const handleClose = () => {
    setOutputImageUrl(null);
    setError(null);
    setIsGenerating(false);
    setCamera({ azimuth: 0, elevation: 0, distance: 1.0 });
    onClose();
  };

  if (!isOpen) return null;

  const stopAll = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  return createPortal(
    <div
      onPointerDown={stopAll}
      onPointerMove={stopAll}
      onPointerUp={stopAll}
      onClick={stopAll}
      onMouseDown={stopAll}
      onMouseMove={stopAll}
      onMouseUp={stopAll}
      onWheel={stopAll}
      onTouchStart={stopAll}
      onTouchMove={stopAll}
      onTouchEnd={stopAll}
      onKeyDown={stopAll}
      style={{ position: "fixed", inset: 0, zIndex: 9999 }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Change Viewing Angle
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Drag the 3D handles or use sliders to set camera angle, then
              generate
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-0">
          {/* Left: 3D Controller + Sliders */}
          <div className="p-6 border-r border-gray-100 flex flex-col gap-4">
            {/* 3D Scene */}
            <div
              ref={containerRef}
              className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-[#111118] border border-gray-200"
            />

            {/* Handle legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0047AB] inline-block" />
                Azimuth
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00FFD0] inline-block" />
                Elevation
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFB800] inline-block" />
                Distance
              </span>
            </div>

            {/* Sliders */}
            <div className="space-y-3">
              {/* Azimuth */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 font-medium">
                    Azimuth (Horizontal)
                  </span>
                  <span className="text-[#0047AB] font-semibold">
                    {Math.round(camera.azimuth)}° —{" "}
                    {getAzimuthLabel(camera.azimuth)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="315"
                  step="45"
                  value={snapToNearest(camera.azimuth, AZIMUTH_STEPS)}
                  onChange={(e) => {
                    updateCamera({ azimuth: parseFloat(e.target.value) });
                    sceneObjRef.current?.updatePositions();
                  }}
                  className="w-full accent-[#0047AB]"
                />
              </div>

              {/* Elevation */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 font-medium">
                    Elevation (Vertical)
                  </span>
                  <span className="text-[#00C4A0] font-semibold">
                    {Math.round(camera.elevation)}° —{" "}
                    {getElevationLabel(camera.elevation)}
                  </span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="60"
                  step="30"
                  value={snapToNearest(camera.elevation, ELEVATION_STEPS)}
                  onChange={(e) => {
                    updateCamera({ elevation: parseFloat(e.target.value) });
                    sceneObjRef.current?.updatePositions();
                  }}
                  className="w-full accent-[#00C4A0]"
                />
              </div>

              {/* Distance */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 font-medium">Distance</span>
                  <span className="text-[#D4A000] font-semibold">
                    {camera.distance.toFixed(1)} —{" "}
                    {getDistanceLabel(camera.distance)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.4"
                  value={snapToNearest(camera.distance, DISTANCE_STEPS)}
                  onChange={(e) => {
                    updateCamera({ distance: parseFloat(e.target.value) });
                    sceneObjRef.current?.updatePositions();
                  }}
                  className="w-full accent-[#D4A000]"
                />
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !imageDataUrl}
              className="w-full py-3 rounded-xl font-semibold text-white bg-[#0047AB] hover:bg-[#003580] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-[#0047AB]/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate New Angle"
              )}
            </button>
          </div>

          {/* Right: Output */}
          <div className="p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-gray-700">Output</h3>

            {/* Output area */}
            <div className="flex-1 min-h-[300px] rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
              {isGenerating ? (
                <div className="text-center text-gray-400">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-[#0047AB]" />
                  <p className="text-sm">
                    Generating new angle...
                    <br />
                    This may take a moment.
                  </p>
                </div>
              ) : outputImageUrl ? (
                <img
                  src={outputImageUrl}
                  alt="Generated angle"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <svg
                    className="w-12 h-12 mx-auto mb-3 text-gray-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <p className="text-sm">
                    Adjust the camera angle and click Generate
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Action buttons */}
            {outputImageUrl && (
              <div className="flex gap-3">
                <button
                  onClick={handleApply}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-[#0047AB] hover:bg-[#003580] transition-colors shadow-lg shadow-[#0047AB]/20 cursor-pointer"
                >
                  Apply to Frame
                </button>
                <button
                  onClick={async () => {
                    try {
                      const resp = await fetch(outputImageUrl);
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `angle-change-${Date.now()}.png`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {
                      window.open(outputImageUrl, "_blank");
                    }
                  }}
                  className="px-4 py-3 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
