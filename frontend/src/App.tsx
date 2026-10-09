import { useState, useEffect } from 'react';
import './App.css';
import { UploadFlow } from './components/UploadFlow';
import { TerrainViewer } from './components/TerrainViewer';
import { ToolRail } from './components/ToolRail';
import { InspectorPanel } from './components/InspectorPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store';
import { isMockMode, api } from './api';

import { useShallow } from 'zustand/react/shallow';

function App() {
  const { 
    result, 
    activeTool, setActiveTool,
    exaggeration, setExaggeration,
    cameraMode, setCameraMode
  } = useAppStore(useShallow(state => ({
    result: state.result,
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
    exaggeration: state.exaggeration,
    setExaggeration: state.setExaggeration,
    cameraMode: state.cameraMode,
    setCameraMode: state.setCameraMode
  })));

  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"Checking..." | "Connected" | "Unreachable">("Checking...");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: number;
    
    const checkHealth = async () => {
      api.setBaseUrl(useAppStore.getState().settings.apiBaseUrl);
      const res = await api.getHealth();
      if (res.status === "ok") {
        setConnectionStatus("Connected");
        setLatencyMs(res.latency);
        setConnectionError(null);
      } else {
        setConnectionStatus("Unreachable");
        setLatencyMs(res.latency);
        setConnectionError(res.error || "Unknown error");
      }
      timeoutId = window.setTimeout(checkHealth, 30000);
    };

    checkHealth();
    
    const onSettingsSave = () => {
      clearTimeout(timeoutId);
      setConnectionStatus("Checking...");
      checkHealth();
    };
    window.addEventListener("settings-saved", onSettingsSave);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("settings-saved", onSettingsSave);
    };
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
            <ErrorBoundary>
              <TerrainViewer />
            </ErrorBoundary>
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
          <span title={connectionError || ""} style={{ cursor: connectionError ? "help" : "default" }}>
            {connectionStatus} {latencyMs !== null && connectionStatus === "Connected" && `(${latencyMs}ms)`}
          </span>
          <span style={{ 
            display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', 
            backgroundColor: connectionStatus === "Connected" ? 'var(--success)' : connectionStatus === "Unreachable" ? 'var(--error)' : 'var(--fg-2)'
          }}></span>
          <span>60 FPS</span>
        </div>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
