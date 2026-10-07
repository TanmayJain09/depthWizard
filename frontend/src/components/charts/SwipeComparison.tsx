import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store";

export function SwipeComparison({ width = 300, height = 300 }: { width?: number, height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { validationMetrics, result } = useAppStore();
  const [divider, setDivider] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !validationMetrics || !result) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const { refData } = validationMetrics;
    const predData = (window as any)._currentGridData as Float32Array;
    
    if (!refData || !predData) return;

    const w = result.meta.width;
    const h = result.meta.height;
    
    // Create an image data
    const imgData = ctx.createImageData(w, h);
    
    // Find min/max for colormap mapping
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < predData.length; i++) {
      if (!Number.isNaN(predData[i])) {
        if (predData[i] < minH) minH = predData[i];
        if (predData[i] > maxH) maxH = predData[i];
      }
      if (!Number.isNaN(refData[i])) {
        if (refData[i] < minH) minH = refData[i];
        if (refData[i] > maxH) maxH = refData[i];
      }
    }

    const range = maxH - minH || 1;

    // We split based on X coordinate
    const splitX = Math.floor(w * divider);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const outIdx = idx * 4;
        
        let val = x < splitX ? predData[idx] : refData[idx];
        
        if (Number.isNaN(val)) {
          imgData.data[outIdx] = 0;
          imgData.data[outIdx + 1] = 0;
          imgData.data[outIdx + 2] = 0;
          imgData.data[outIdx + 3] = 0;
        } else {
          // simple grayscale ramp approximation
          const norm = (val - minH) / range;
          imgData.data[outIdx] = Math.floor(norm * 255);
          imgData.data[outIdx + 1] = Math.floor(norm * 255);
          imgData.data[outIdx + 2] = Math.floor(norm * 255);
          imgData.data[outIdx + 3] = 255;
        }
      }
    }

    // Since grid is huge, we draw it to an offscreen canvas and scale it to our view
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    offscreen.getContext("2d")!.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreen, 0, 0, width, height);

    // Draw divider line
    ctx.strokeStyle = "#FF6A2B";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(divider * width, 0);
    ctx.lineTo(divider * width, height);
    ctx.stroke();

  }, [validationMetrics, result, divider, width, height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updateDivider(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateDivider(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const updateDivider = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let d = x / rect.width;
    d = Math.max(0, Math.min(1, d));
    setDivider(d);
  };

  return (
    <div 
      ref={containerRef}
      style={{ width, height, position: "relative", cursor: "col-resize", background: "var(--bg-0)", borderRadius: "4px", overflow: "hidden" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} />
      <div style={{ position: "absolute", top: 4, left: 4, fontSize: "10px", color: "#FFF", background: "rgba(0,0,0,0.5)", padding: "2px 4px", pointerEvents: "none" }}>PRED</div>
      <div style={{ position: "absolute", top: 4, right: 4, fontSize: "10px", color: "#FFF", background: "rgba(0,0,0,0.5)", padding: "2px 4px", pointerEvents: "none" }}>REF</div>
    </div>
  );
}
