import React, { useState, Suspense } from 'react';
import { useAppStore } from '../../store';

// Lazy load charts to keep initial bundle small
const ErrorHistogram = React.lazy(() => import('./charts/ErrorHistogram').then(m => ({ default: m.ErrorHistogram })));
const DensityScatter = React.lazy(() => import('./charts/DensityScatter').then(m => ({ default: m.DensityScatter })));

export default function ValidationPanel() {
  const { 
    validationRefFile, 
    validationStatus, 
    validationError, 
    validationMetrics, 
    validationNodata,
    showErrorMap,
    result,
    setValidationRefFile, 
    setValidationNodata,
    setShowErrorMap,
    runValidation, 
    cancelValidation 
  } = useAppStore();

  // We need predData to run validation, but wait, `runValidation` takes predData.
  // The predData is in the Web Worker for the terrain right now, but wait...
  // In `TerrainViewer`, `grid.data` is the predData.
  // We can just trigger validation with `grid.data` from `TerrainViewer` when a button is clicked, 
  // or we can store `grid` in the store when it parses. Wait, `store.ts` doesn't have `grid` currently.
  // `store` doesn't have `grid.data`. 
  // Let's modify `runValidation` to fetch `heightmap.png` and decode it itself if not passed, OR just pass `grid.data` via a global event / ref.
  // Actually, we can add `gridData: Float32Array | null` to the store and set it when `TerrainViewer` parses it!
  
  const handleValidate = () => {
    const state = useAppStore.getState();
    const gridData = (window as any)._currentGridData; // Hack for now, or use store
    if (gridData) {
      runValidation(gridData);
    }
  };

  const handleExportJson = () => {
    if (!validationMetrics) return;
    const blob = new Blob([JSON.stringify(validationMetrics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "validation_metrics.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (!validationMetrics) return;
    const m = validationMetrics.all;
    const csv = `Metric,Value\nRMSE,${m.rmse}\nMAE,${m.mae}\nBias,${m.bias}\nPearson,${m.pearson}\nMinError,${m.minError}\nMaxError,${m.maxError}\nP90,${m.p90}\nP95,${m.p95}\nValidPixels,${m.validPixels}\nOverlapPercent,${validationMetrics.overlapPercent}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "validation_metrics.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="inspector-section">
      <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Reference DSM (GeoTIFF)</div>
      
      <input 
        type="file" 
        accept=".tif,.tiff" 
        onChange={(e) => e.target.files && setValidationRefFile(e.target.files[0])}
        className="file-input"
        style={{ marginBottom: "var(--sp-4)" }}
      />

      <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Nodata Override (Optional)</div>
      <input 
        type="number" 
        placeholder="e.g. -9999"
        value={validationNodata === undefined ? "" : validationNodata}
        onChange={(e) => setValidationNodata(e.target.value ? parseFloat(e.target.value) : undefined)}
        className="text-input mono-data"
        style={{ width: "100%", marginBottom: "var(--sp-4)" }}
      />

      {validationStatus === "idle" && validationRefFile && (
        <button className="btn-primary" style={{ width: "100%" }} onClick={handleValidate}>
          Run Validation
        </button>
      )}

      {validationStatus === "running" && (
        <div>
          <div className="mono-data" style={{ color: "var(--fg-1)", marginBottom: "var(--sp-2)" }}>Computing validation...</div>
          <button className="btn-secondary" style={{ width: "100%" }} onClick={cancelValidation}>
            Cancel
          </button>
        </div>
      )}

      {validationStatus === "error" && (
        <div className="error-box mono-data" style={{ marginTop: "var(--sp-4)" }}>
          {validationError}
        </div>
      )}

      {validationMetrics && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
            <div className="section-label">Metrics (All Pixels)</div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button className="btn-secondary" style={{ padding: "2px 6px", fontSize: "10px" }} onClick={handleExportJson}>JSON</button>
              <button className="btn-secondary" style={{ padding: "2px 6px", fontSize: "10px" }} onClick={handleExportCsv}>CSV</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>RMSE</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>{validationMetrics.all.rmse.toFixed(3)}m</div>
            </div>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>MAE</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>{validationMetrics.all.mae.toFixed(3)}m</div>
            </div>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Bias</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>{validationMetrics.all.bias.toFixed(3)}m</div>
            </div>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Pearson r</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>{validationMetrics.all.pearson.toFixed(3)}</div>
            </div>
          </div>

          <div className="section-label" style={{ marginBottom: "var(--sp-2)", marginTop: "var(--sp-4)" }}>Bias-Corrected RMSE</div>
          <div className="metric-card" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>{validationMetrics.biasCorrectedRmse.toFixed(3)}m</div>
          </div>

          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Visuals</div>
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
              <input 
                type="checkbox" 
                checked={showErrorMap} 
                onChange={(e) => setShowErrorMap(e.target.checked)} 
              />
              <span className="mono-data" style={{ color: "var(--fg-1)" }}>Show 3D Error Heatmap</span>
            </label>
          </div>

          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Charts</div>
          <Suspense fallback={<div className="mono-data">Loading charts...</div>}>
            <div style={{ marginBottom: "var(--sp-4)" }}>
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", marginBottom: "4px" }}>Error Histogram</div>
              <ErrorHistogram data={validationMetrics.histogram} />
            </div>
            <div style={{ marginBottom: "var(--sp-4)" }}>
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", marginBottom: "4px" }}>Density Scatter</div>
              <DensityScatter data={validationMetrics.scatter} />
            </div>
          </Suspense>
          
          <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", marginTop: "var(--sp-4)" }}>
            Overlap: {validationMetrics.overlapPercent.toFixed(1)}% ({validationMetrics.all.validPixels} pixels)
          </div>
        </div>
      )}

      {result?.meta?.classes && Object.keys(result.meta.classes).length > 0 && (
        <div style={{ marginTop: "var(--sp-8)", borderTop: "1px solid var(--bg-2)", paddingTop: "var(--sp-4)" }}>
          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Backend-reported (calibration)</div>
          <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", marginBottom: "var(--sp-2)" }}>
            Note: These are from the initial calibration fit, not an independent check.
          </div>
          {Object.entries(result.meta.classes).map(([cName, cStats]: [string, any]) => (
            <div key={cName} style={{ marginBottom: "var(--sp-2)", padding: "var(--sp-2)", background: "var(--bg-1)", borderRadius: "4px" }}>
              <div className="mono-data" style={{ color: "var(--fg-1)", textTransform: "capitalize", marginBottom: "4px" }}>{cName}</div>
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>
                RMSE: {cStats.rmse.toFixed(2)}m | RefPts: {cStats.n_ref} | Shift: {cStats.shift.toFixed(2)}m
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
