import type { ToolMode } from "./ToolRail";

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
  
  return (
    <div className="inspector-panel">
      <div className="inspector-header">
        <div className="section-label">Inspector: {activeTool}</div>
      </div>
      
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
      
      {/* Additional tool panels would go here */}
      
    </div>
  );
}
