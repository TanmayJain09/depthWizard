import React from 'react';
import './App.css';
import { UploadFlow } from './components/UploadFlow';
import { TerrainViewer } from './components/TerrainViewer';
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
        <TerrainViewer />
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
