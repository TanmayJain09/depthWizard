import './App.css';
import { UploadFlow } from './components/UploadFlow';
import { TerrainViewer } from './components/TerrainViewer';
import { ToolRail } from './components/ToolRail';
import { InspectorPanel } from './components/InspectorPanel';
import { useAppStore } from './store';
import { isMockMode } from './api';

function App() {
  const { 
    result, 
    activeTool, setActiveTool,
    exaggeration, setExaggeration,
    cameraMode, setCameraMode
  } = useAppStore();

  return (
    <div className="app-container">
      {result && (
        <ToolRail activeTool={activeTool} onSelect={setActiveTool} />
      )}
      
      <div className="main-viewport">
        {!result ? (
          <UploadFlow />
        ) : (
          <div className="viewer-container">
            <TerrainViewer />
          </div>
        )}
      </div>

      {result && (
        <InspectorPanel 
          activeTool={activeTool}
          exaggeration={exaggeration}
          setExaggeration={setExaggeration}
          cameraMode={cameraMode}
          setCameraMode={setCameraMode}
          resetView={() => {
            // Signal viewer to reset camera
            window.dispatchEvent(new CustomEvent("reset-camera"));
          }}
        />
      )}

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-group">
          {isMockMode && <span className="mock-badge">MOCK DATA</span>}
          <span>READY</span>
        </div>
        <div className="status-group">
          <span>60 FPS</span>
        </div>
      </div>
    </div>
  );
}

export default App;
