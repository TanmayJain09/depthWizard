import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store";

export function RegionDrawer({ width = 320, height = 320 }: { width?: number, height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { validationMetrics, result, computeRegionMetrics, regionMetrics } = useAppStore();
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{x: number, y: number} | null>(null);
  const [tag, setTag] = useState("custom");

  useEffect(() => {
    if (!canvasRef.current || !validationMetrics || !result) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const w = result.meta.width;
    const h = result.meta.height;
    
    // Create an image data from errorTexture
    const imgData = new ImageData(new Uint8ClampedArray(validationMetrics.errorTexture), w, h);
    
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    offscreen.getContext("2d")!.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreen, 0, 0, width, height);

    // Draw active rectangle
    if (isDrawing && startPoint && currentPoint) {
      ctx.strokeStyle = "#FF6A2B";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.min(startPoint.x, currentPoint.x) * width,
        Math.min(startPoint.y, currentPoint.y) * height,
        Math.abs(currentPoint.x - startPoint.x) * width,
        Math.abs(currentPoint.y - startPoint.y) * height
      );
    }
  }, [validationMetrics, result, width, height, isDrawing, startPoint, currentPoint]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setStartPoint({x, y});
    setCurrentPoint({x, y});
    setIsDrawing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setCurrentPoint({x, y});
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || !startPoint || !currentPoint || !result) return;
    setIsDrawing(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    const w = result.meta.width;
    const h = result.meta.height;
    
    const px1 = Math.floor(Math.min(startPoint.x, currentPoint.x) * w);
    const py1 = Math.floor(Math.min(startPoint.y, currentPoint.y) * h);
    const px2 = Math.floor(Math.max(startPoint.x, currentPoint.x) * w);
    const py2 = Math.floor(Math.max(startPoint.y, currentPoint.y) * h);
    
    if (px2 - px1 < 5 || py2 - py1 < 5) return; // Too small

    const mask = new Uint8Array(w * h);
    for (let y = py1; y <= py2; y++) {
      for (let x = px1; x <= px2; x++) {
        mask[y * w + x] = 1;
      }
    }
    
    computeRegionMetrics(mask, tag);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  if (!validationMetrics) return null;

  return (
    <div>
      <div style={{ marginBottom: "var(--sp-2)", display: "flex", gap: "var(--sp-2)" }}>
        <select value={tag} onChange={e => setTag(e.target.value)} className="text-input mono-data" style={{ flex: 1, padding: "2px" }}>
          <option value="urban">Urban</option>
          <option value="sparse">Sparse</option>
          <option value="hilly">Hilly</option>
          <option value="forest">Forest</option>
          <option value="custom">Custom</option>
        </select>
        <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", display: "flex", alignItems: "center" }}>
          Draw rect on map
        </div>
      </div>
      
      <div 
        ref={containerRef}
        style={{ width, height, position: "relative", cursor: "crosshair", background: "var(--bg-0)", borderRadius: "4px", overflow: "hidden" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>

      {regionMetrics.length > 0 && (
        <div style={{ marginTop: "var(--sp-2)" }}>
          <table style={{ width: "100%", fontSize: "10px", color: "var(--fg-1)", textAlign: "left" }} className="mono-data">
            <thead>
              <tr style={{ color: "var(--fg-2)" }}>
                <th>Tag</th>
                <th>RMSE</th>
                <th>Pixels</th>
              </tr>
            </thead>
            <tbody>
              {regionMetrics.map(r => (
                <tr key={r.id}>
                  <td style={{ textTransform: "capitalize" }}>{r.tag}</td>
                  <td>{r.rmse.toFixed(2)}m</td>
                  <td>{r.validPixels}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
