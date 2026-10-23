import { useState } from 'react';
import { useAppStore } from '../store';
import { api } from '../api';

import { useShallow } from 'zustand/react/shallow';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useAppStore(useShallow(state => ({
    settings: state.settings,
    setSettings: state.setSettings
  })));
  const [url, setUrl] = useState(settings.apiBaseUrl);
  const [nodata, setNodata] = useState(settings.defaultNodata?.toString() || "");
  const [conf, setConf] = useState(settings.defaultConfThreshold);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMsg("Testing...");
    
    // Temporarily override the API base URL in the api module for testing
    const originalUrl = settings.apiBaseUrl;
    api.setBaseUrl(url); // We'll add this to api.ts
    
    try {
      const start = performance.now();
      await api.ping(); // We'll add this to api.ts
      const latency = Math.round(performance.now() - start);
      setTestStatus("ok");
      setTestMsg(`Connection OK (${latency}ms)`);
    } catch (e: any) {
      setTestStatus("error");
      setTestMsg(e.message || "Connection failed");
    } finally {
      // Revert if they don't save
      api.setBaseUrl(originalUrl);
    }
  };

  const handleSave = () => {
    setSettings({
      apiBaseUrl: url,
      defaultNodata: nodata ? parseFloat(nodata) : undefined,
      defaultConfThreshold: conf
    });
    api.setBaseUrl(url);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: 'var(--bg-0)',
        padding: 'var(--sp-6)',
        borderRadius: '8px',
        width: '400px',
        border: '1px solid var(--bg-2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{ margin: '0 0 var(--sp-4) 0', fontSize: '18px', color: 'var(--fg-1)' }}>Settings</h2>
        
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label className="section-label" style={{ display: 'block', marginBottom: '8px' }}>Backend API URL</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="text-input mono-data"
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={handleTestConnection} disabled={testStatus === "testing"}>
              Test
            </button>
          </div>
          {testStatus !== "idle" && (
            <div className="mono-data" style={{ 
              marginTop: '4px', fontSize: '10px', 
              color: testStatus === "ok" ? "var(--success)" : testStatus === "error" ? "var(--error)" : "var(--fg-2)" 
            }}>
              {testMsg}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label className="section-label" style={{ display: 'block', marginBottom: '8px' }}>Default Nodata Value</label>
          <input 
            type="number" 
            value={nodata}
            onChange={e => setNodata(e.target.value)}
            className="text-input mono-data"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <label className="section-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Default Confidence Threshold</span>
            <span className="mono-data">{conf.toFixed(2)}</span>
          </label>
          <input 
            type="range"
            min="0" max="1" step="0.05"
            value={conf}
            onChange={e => setConf(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
