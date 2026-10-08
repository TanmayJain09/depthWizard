import React, { Suspense } from 'react';
import { useAppStore } from '../store';

// Lazy load charts to keep initial bundle small
const ErrorHistogram = React.lazy(() => import('./charts/ErrorHistogram').then(m => ({ default: m.ErrorHistogram })));
const DensityScatter = React.lazy(() => import('./charts/DensityScatter').then(m => ({ default: m.DensityScatter })));
const SwipeComparison = React.lazy(() => import('./charts/SwipeComparison').then(m => ({ default: m.SwipeComparison })));
const RegionDrawer = React.lazy(() => import('./charts/RegionDrawer').then(m => ({ default: m.RegionDrawer })));

export default function ValidationPanel() {
  const { 
    validationRefFile, 
    validationStatus, 
    validationError, 
    validationMetrics, 
    validationNodata,
    showErrorMap,
    showReference,
    result,
    confThreshold,
    setValidationRefFile, 
    setValidationNodata,
    setConfThreshold,
    setShowErrorMap,
    setShowReference,
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

  const handleExportPng = () => {
    if (!validationMetrics || !result) return;
    const w = result.meta.width;
    const h = result.meta.height;
    const imgData = new ImageData(new Uint8ClampedArray(validationMetrics.errorTexture), w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.putImageData(imgData, 0, 0);
    c.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "error_heatmap.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
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

      <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Datum / Height Reference</div>
      <div className="mono-data" style={{ marginBottom: "var(--sp-4)", color: "var(--fg-1)" }}>
        {result?.meta?.datum || "datum unknown"}
      </div>

      {result?.meta?.files?.confidence && (
        <>
          <div className="section-label" style={{ marginBottom: "var(--sp-2)", display: "flex", justifyContent: "space-between" }}>
            <span>Confidence Threshold</span>
            <span className="mono-data">{confThreshold.toFixed(2)}</span>
          </div>
          <input 
            type="range"
            min="0" max="1" step="0.05"
            value={confThreshold}
            onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
            style={{ width: "100%", marginBottom: "var(--sp-4)" }}
          />
        </>
      )}

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
              <button className="btn-secondary" style={{ padding: "2px 6px", fontSize: "10px" }} onClick={handleExportPng}>PNG</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>RMSE {validationMetrics.confident ? "(All / Conf)" : ""}</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>
                {validationMetrics.all.rmse.toFixed(3)}m 
                {validationMetrics.confident && ` / ${validationMetrics.confident.rmse.toFixed(3)}m`}
              </div>
            </div>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>MAE {validationMetrics.confident ? "(All / Conf)" : ""}</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>
                {validationMetrics.all.mae.toFixed(3)}m
                {validationMetrics.confident && ` / ${validationMetrics.confident.mae.toFixed(3)}m`}
              </div>
            </div>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Bias {validationMetrics.confident ? "(All / Conf)" : ""}</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>
                {validationMetrics.all.bias.toFixed(3)}m
                {validationMetrics.confident && ` / ${validationMetrics.confident.bias.toFixed(3)}m`}
              </div>
            </div>
            <div className="metric-card">
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Pearson r {validationMetrics.confident ? "(All / Conf)" : ""}</div>
              <div className="mono-data" style={{ fontSize: "14px", color: "var(--fg-1)" }}>
                {validationMetrics.all.pearson.toFixed(3)}
                {validationMetrics.confident && ` / ${validationMetrics.confident.pearson.toFixed(3)}`}
              </div>
            </div>
          </div>

          <div className="section-label" style={{ marginBottom: "var(--sp-2)", marginTop: "var(--sp-4)" }}>Stratified RMSE</div>
          {validationMetrics.stratified && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
              <div className="metric-card">
                <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Slope: Flat / Mod / Steep</div>
                <div className="mono-data" style={{ fontSize: "12px", color: "var(--fg-1)" }}>
                  {validationMetrics.stratified.slopeRmse.flat?.toFixed(2) ?? '-'}m / {validationMetrics.stratified.slopeRmse.moderate?.toFixed(2) ?? '-'}m / {validationMetrics.stratified.slopeRmse.steep?.toFixed(2) ?? '-'}m
                </div>
              </div>
              <div className="metric-card">
                <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Height: Low / Mid / High</div>
                <div className="mono-data" style={{ fontSize: "12px", color: "var(--fg-1)" }}>
                  {validationMetrics.stratified.heightRmse.low?.toFixed(2) ?? '-'}m / {validationMetrics.stratified.heightRmse.mid?.toFixed(2) ?? '-'}m / {validationMetrics.stratified.heightRmse.high?.toFixed(2) ?? '-'}m
                </div>
              </div>
              {validationMetrics.stratified.confRmse && (
                <div className="metric-card">
                  <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>Confidence: Low / High</div>
                  <div className="mono-data" style={{ fontSize: "12px", color: "var(--fg-1)" }}>
                    {validationMetrics.stratified.confRmse.low?.toFixed(2) ?? '-'}m / {validationMetrics.stratified.confRmse.high?.toFixed(2) ?? '-'}m
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Visuals</div>
          <div style={{ marginBottom: "var(--sp-4)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
              <input 
                type="checkbox" 
                checked={showErrorMap} 
                onChange={(e) => setShowErrorMap(e.target.checked)} 
              />
              <span className="mono-data" style={{ color: "var(--fg-1)" }}>Show 3D Error Heatmap</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
              <input 
                type="checkbox" 
                checked={showReference} 
                onChange={(e) => setShowReference(e.target.checked)} 
              />
              <span className="mono-data" style={{ color: "var(--fg-1)" }}>Toggle 3D View (Pred / Ref)</span>
            </label>
          </div>

          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Charts & Comparisons</div>
          <Suspense fallback={<div className="mono-data">Loading charts...</div>}>
            <div style={{ marginBottom: "var(--sp-4)" }}>
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", marginBottom: "4px" }}>2D Region Masks</div>
              <RegionDrawer width={320} height={320} />
            </div>
            <div style={{ marginBottom: "var(--sp-4)" }}>
              <div className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)", marginBottom: "4px" }}>Predicted vs Reference Swipe</div>
              <SwipeComparison width={320} height={200} />
            </div>
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

      {/* Validation History */}
      {useAppStore.getState().validationHistory.length > 0 && (
        <div style={{ marginTop: "var(--sp-8)", borderTop: "1px solid var(--bg-2)", paddingTop: "var(--sp-4)" }}>
          <div className="section-label" style={{ marginBottom: "var(--sp-2)" }}>Session History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {useAppStore.getState().validationHistory.map((run: any) => (
              <div key={run.id} style={{ padding: "4px", background: "var(--bg-1)", borderRadius: "2px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <input 
                  type="text" 
                  value={run.tag} 
                  onChange={(e) => useAppStore.getState().updateValidationRunTag(run.id, e.target.value)}
                  style={{ background: "transparent", border: "none", color: "var(--fg-1)", width: "80px", fontSize: "10px" }}
                  className="mono-data"
                />
                <span className="mono-data" style={{ fontSize: "10px", color: "var(--fg-2)" }}>RMSE: {run.rmse.toFixed(2)}m</span>
              </div>
            ))}
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
