import React from 'react';
import './App.css';
import { UploadFlow } from './components/UploadFlow';
import { useAppStore } from './store';
import { isMockMode } from './api';

function App() {
  const { result } = useAppStore();

  return (
    <div className="app-container">
      {/* Main Content */}
      {!result ? (
        <UploadFlow />
      ) : (
        <div className="centered">
          <div className="mono-data" style={{ color: "var(--fg-1)" }}>
            3D Viewer goes here...
          </div>
          {/* Temporary debug view for result */}
          <pre style={{ textAlign: "left", fontSize: "10px", marginTop: "16px", color: "var(--fg-2)" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
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
