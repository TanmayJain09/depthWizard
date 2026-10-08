import React, { useCallback } from "react";
import { useAppStore } from "../store";
import { Upload, FileWarning } from "lucide-react";

export function UploadFlow() {
  const {
    selectedFile,
    calibrateMode,
    jobStatus,
    jobProgress,
    jobStage,
    jobError,
    setFile,
    setReferenceFile,
    setLabelsFile,
    setCalibrateMode,
    startJob,
    reset,
    useBlankMask,
    setUseBlankMask,
    pixelSizeM,
    setPixelSizeM,
    robustFit,
    setRobustFit,
  } = useAppStore();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (jobStatus !== "idle" && jobStatus !== "failed") return;
      
      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith("image/") || file.name.endsWith(".tif") || file.name.endsWith(".tiff"))) {
        setFile(file);
      }
    },
    [jobStatus, setFile]
  );

  const isGeoTiff = selectedFile?.name.toLowerCase().endsWith(".tif") || selectedFile?.name.toLowerCase().endsWith(".tiff");

  if (jobStatus === "processing" || jobStatus === "queued") {
    return (
      <div className="upload-container centered">
        <div className="progress-box">
          <div className="mono-data" style={{ marginBottom: "var(--sp-2)", color: "var(--fg-1)" }}>
            {jobStage || "Initializing..."}
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${jobProgress}%` }}></div>
          </div>
          <div className="mono-data" style={{ marginTop: "var(--sp-2)", textAlign: "right", fontSize: "var(--text-10)" }}>
            {jobProgress}%
          </div>
        </div>
      </div>
    );
  }

  if (jobStatus === "failed") {
    return (
      <div className="upload-container centered">
        <div className="error-box">
          <FileWarning size={24} style={{ color: "var(--error)", marginBottom: "var(--sp-2)" }} />
          <div className="mono-data" style={{ color: "var(--error)", marginBottom: "var(--sp-4)" }}>
            {jobError}
          </div>
          <button className="btn-secondary" onClick={reset}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-container centered">
      {!selectedFile ? (
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <Upload size={32} style={{ color: "var(--fg-2)", marginBottom: "var(--sp-4)" }} />
          <div style={{ color: "var(--fg-1)", marginBottom: "var(--sp-2)" }}>Drop a PNG, JPG or GeoTIFF</div>
          <div className="mono-data" style={{ fontSize: "var(--text-10)", color: "var(--fg-2)" }}>
            or click to browse
          </div>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.tif,.tiff"
            className="file-hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) setFile(e.target.files[0]);
            }}
          />
        </div>
      ) : (
        <div className="file-config-box">
          <div className="config-header">
            <div className="mono-data">{selectedFile.name}</div>
            <button className="btn-tertiary" onClick={() => setFile(null as any)}>Clear</button>
          </div>
          
          <div style={{ marginTop: "var(--sp-4)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <span className={`badge ${isGeoTiff ? 'badge-geo' : 'badge-rel'}`}>
              {isGeoTiff ? "ABSOLUTE DSM (metric)" : "RELATIVE DSM (rDSM, unitless)"}
            </span>
          </div>

          <div style={{ marginTop: "var(--sp-6)" }}>
            <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Calibration Mode</div>
            <select 
              value={calibrateMode} 
              onChange={(e) => setCalibrateMode(e.target.value as any)}
              className="select-input"
            >
              <option value="none">None (Raw Output)</option>
              {isGeoTiff && <option value="georeferenced">Georeferenced (Sparse Points)</option>}
              <option value="relative">Relative (Height Priors)</option>
            </select>
          </div>

          <div style={{ marginTop: "var(--sp-4)" }}>
            <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Advanced: Segmentation Mask (Optional)</div>
            <input 
              type="file" 
              accept=".png,.jpg,.jpeg" 
              onChange={(e) => {
                if (e.target.files) setLabelsFile(e.target.files[0]);
              }}
              className="file-input"
            />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "var(--sp-2)", cursor: "pointer" }}>
              <input 
                type="checkbox" 
                checked={useBlankMask} 
                onChange={(e) => setUseBlankMask(e.target.checked)} 
              />
              <span className="mono-data" style={{ color: "var(--fg-1)", fontSize: "var(--text-10)" }}>
                Use blank mask (heights will be inaccurate)
              </span>
            </label>
          </div>

          {calibrateMode === "georeferenced" && (
            <div style={{ marginTop: "var(--sp-4)" }}>
              <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Reference GeoTIFF (Optional)</div>
              <input 
                type="file" 
                accept=".tif,.tiff" 
                onChange={(e) => e.target.files && setReferenceFile(e.target.files[0])}
                className="file-input"
              />
            </div>
          )}

          <div style={{ marginTop: "var(--sp-4)" }}>
            {isGeoTiff ? (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={robustFit} 
                  onChange={(e) => setRobustFit(e.target.checked)} 
                />
                <span className="mono-data" style={{ color: "var(--fg-1)", fontSize: "var(--text-10)" }}>
                  Robust fit (Huber) for calibration
                </span>
              </label>
            ) : (
              <div>
                <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Approximate pixel size (m) (Optional)</div>
                <input 
                  type="number" 
                  value={pixelSizeM} 
                  onChange={(e) => setPixelSizeM(e.target.value)}
                  placeholder="e.g. 0.5"
                  className="text-input"
                  style={{ width: "100%" }}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: "var(--sp-8)", textAlign: "right" }}>
            <button className="btn-primary" onClick={startJob}>Process Image</button>
          </div>
        </div>
      )}
    </div>
  );
}
