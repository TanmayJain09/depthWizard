import React from 'react';
import type { ToolMode } from "./ToolRail";
import { ExportPanel } from './ExportPanel';
import { useAppStore } from '../store';

const ValidationPanel = React.lazy(() => import('./ValidationPanel'));

interface InspectorPanelProps {
  activeTool: ToolMode;
  exaggeration: number;
  setExaggeration: (val: number) => void;
  cameraMode: "orbit" | "fly";
  setCameraMode: (mode: "orbit" | "fly") => void;
  resetView: () => void;
}

export function InspectorPanel({
  activeTool,
  exaggeration,
  setExaggeration,
  cameraMode,
  setCameraMode,
  resetView
}: InspectorPanelProps) {
  
  const inputDimensions = useAppStore(s => s.inputDimensions);
  const meta = useAppStore(s => s.result?.meta);
  const showExifWarning = inputDimensions && meta && (inputDimensions.width !== meta.width || inputDimensions.height !== meta.height);
  const bookmarks = useAppStore(s => s.bookmarks);
  const isTouring = useAppStore(s => s.isTouring);
  const tourSpeed = useAppStore(s => s.tourSpeed);

  return (
    <div className="inspector-panel">
      <div className="inspector-header">
        <div className="section-label">Inspector: {activeTool}</div>
      </div>

      {showExifWarning && (
        <div style={{ padding: "8px", background: "rgba(255,0,0,0.1)", color: "var(--error)", fontSize: "10px", margin: "8px" }} className="mono-data">
          Warning: Input dimensions changed (Mishandled EXIF rotation). Expected {inputDimensions.width}x{inputDimensions.height}, got {meta.width}x{meta.height}.
        </div>
      )}
      
      {activeTool === "navigate" && (
        <div className="inspector-section">
          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Camera Mode</div>
          <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
            <button 
              className={cameraMode === "orbit" ? "btn-primary" : "btn-secondary"} 
              style={{ flex: 1 }}
              onClick={() => setCameraMode("orbit")}
            >
              Orbit
            </button>
            <button 
              className={cameraMode === "fly" ? "btn-primary" : "btn-secondary"} 
              style={{ flex: 1 }}
              onClick={() => setCameraMode("fly")}
            >
              Fly (WASD)
            </button>
          </div>
          
          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Vertical Exaggeration</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
            <input 
              type="range" 
              min="0.1" max="10" step="0.1" 
              value={exaggeration} 
              onChange={e => setExaggeration(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="mono-data" style={{ width: "30px" }}>{exaggeration.toFixed(1)}x</span>
          </div>

          <div className="section-label" style={{ marginBottom: "var(--sp-2)", marginTop: "var(--sp-4)" }}>Bookmarks & Tour</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "var(--sp-4)" }}>
            <button className="btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("save-bookmark"))}>
              Save Current View
            </button>
            {bookmarks.map(b => (
              <div key={b.id} style={{ display: "flex", gap: "4px", alignItems: "center", background: "var(--bg-1)", padding: "4px", borderRadius: "4px" }}>
                <input 
                  type="text" 
                  value={b.name} 
                  onChange={(e) => useAppStore.getState().renameBookmark(b.id, e.target.value)}
                  style={{ background: "transparent", border: "none", color: "var(--fg-1)", flex: 1, fontSize: "12px" }}
                  className="mono-data"
                />
                <button className="btn-secondary" style={{ padding: "2px 6px", fontSize: "10px" }} onClick={() => useAppStore.getState().setActiveBookmarkId(b.id)}>Go</button>
                <button className="btn-secondary" style={{ padding: "2px 6px", fontSize: "10px" }} onClick={() => useAppStore.getState().removeBookmark(b.id)}>X</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
              <button 
                className={isTouring ? "btn-primary" : "btn-secondary"} 
                onClick={() => useAppStore.getState().setIsTouring(!useAppStore.getState().isTouring)}
                style={{ flex: 1 }}
              >
                {isTouring ? "Stop Tour" : "Start Auto-Tour"}
              </button>
              {isTouring && (
                <input 
                  type="range" 
                  min="0.1" max="2" step="0.1" 
                  value={tourSpeed} 
                  onChange={(e) => useAppStore.getState().setTourSpeed(parseFloat(e.target.value))}
                  style={{ width: "60px" }}
                />
              )}
            </div>
          </div>

          <button className="btn-secondary" style={{ width: "100%" }} onClick={resetView}>Reset View</button>
        </div>
      )}

      {activeTool === "measure" && (
        <div className="inspector-section">
          <div className="mono-data" style={{ color: "var(--fg-1)" }}>
            Click on the terrain to place measurement points.
          </div>
        </div>
      )}
      
      {activeTool === "validate" && (
        <React.Suspense fallback={<div className="mono-data">Loading validation...</div>}>
          <ValidationPanel />
        </React.Suspense>
      )}

      {activeTool === "export" && (
        <ExportPanel />
      )}
      
    </div>
  );
}
