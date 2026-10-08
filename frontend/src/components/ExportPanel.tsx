import { useState } from 'react';
import { useAppStore } from '../store';
import { api } from '../api';

export function ExportPanel() {
  const { result } = useAppStore();
  const [exporting, setExporting] = useState(false);

  const downloadFile = async (baseFilename: string, relativePath: string) => {
    try {
      setExporting(true);
      const url = await api.getFileUrl(result!.meta.job_id, relativePath);
      
      let finalFilename = baseFilename;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const contentType = res.headers.get('content-type');
        if (contentType) {
          if (contentType.includes('image/jpeg')) {
            finalFilename = finalFilename.replace('.png', '.jpg');
          } else if (contentType.includes('image/png')) {
            finalFilename = finalFilename.replace('.jpg', '.png');
          } else if (contentType.includes('image/tiff')) {
            finalFilename = finalFilename.replace('.jpg', '.tif').replace('.png', '.tif');
          }
        }
      } catch {
        // Fallback to baseFilename if HEAD fails
      }

      const a = document.createElement('a');
      a.href = url;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // If it's an object URL, we should probably revoke it after a short delay
      if (url.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      console.error("Download failed", e);
      alert("Failed to download file.");
    } finally {
      setExporting(false);
    }
  };

  const handleScreenshot = () => {
    // Dispatch event to TerrainViewer to capture screenshot
    window.dispatchEvent(new CustomEvent('export-screenshot'));
  };

  const handleExportMesh = () => {
    window.dispatchEvent(new CustomEvent('export-mesh'));
  };

  if (!result) return <div className="mono-data">No result available.</div>;

  const { files } = result.meta;

  return (
    <div className="inspector-section">
      <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Backend Artifacts</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 'var(--sp-6)' }}>
        {files?.heightmap && (
          <button className="btn-secondary" onClick={() => downloadFile('heightmap.png', files.heightmap)} disabled={exporting}>
            Download Heightmap (16-bit PNG)
          </button>
        )}
        {files?.confidence && (
          <button className="btn-secondary" onClick={() => downloadFile('confidence.png', files.confidence)} disabled={exporting}>
            Download Confidence (8-bit PNG)
          </button>
        )}
        {files?.texture && (
          <button className="btn-secondary" onClick={() => downloadFile('texture.png', files.texture)} disabled={exporting}>
            Download Texture Overlay
          </button>
        )}
        {files?.calibrated_georeference && (
          <button className="btn-secondary" onClick={() => downloadFile('calibrated.tif', files.calibrated_georeference)} disabled={exporting}>
            Download Calibrated GeoTIFF
          </button>
        )}
        {result.meta && (
          <button className="btn-secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(result.meta, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'metadata.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>
            Download Metadata (JSON)
          </button>
        )}
      </div>

      <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Client-Side Exports</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button className="btn-primary" onClick={handleScreenshot}>
          Capture Screenshot
        </button>
        <button className="btn-secondary" onClick={handleExportMesh}>
          Export 3D Mesh (OBJ)
        </button>
      </div>
    </div>
  );
}
