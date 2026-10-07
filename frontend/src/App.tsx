import { useState, useEffect } from 'react';
import './App.css';
import { UploadFlow } from './components/UploadFlow';
import { TerrainViewer } from './components/TerrainViewer';
import { ToolRail } from './components/ToolRail';
import { InspectorPanel } from './components/InspectorPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { useAppStore } from './store';
import { isMockMode, api } from './api';

function App() {
  const { 
    result, 
    activeTool, setActiveTool,
    exaggeration, setExaggeration,
    cameraMode, setCameraMode
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"Checking..." | "Connected" | "Error">("Checking...");

  useEffect(() => {
    api.ping().then(() => setConnectionStatus("Connected")).catch(() => setConnectionStatus("Error"));
  }, []);

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
          {isMockMode && <span className="mock-badge" style={{ backgroundColor: 'var(--accent)', color: 'black', padding: '0 4px', borderRadius: '2px', fontWeight: 'bold' }}>MOCK DATA</span>}
          <span>READY</span>
          <button className="btn-secondary" style={{ padding: '0 4px', fontSize: '10px' }} onClick={() => setShowSettings(true)}>Settings</button>
        </div>
        <div className="status-group">
          <span>{connectionStatus}</span>
          <span style={{ 
            display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', 
            backgroundColor: connectionStatus === "Connected" ? 'var(--success)' : connectionStatus === "Error" ? 'var(--error)' : 'var(--fg-2)'
          }}></span>
          <span>60 FPS</span>
        </div>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
