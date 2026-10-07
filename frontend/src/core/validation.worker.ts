import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { initializeProjRegistry, hasCRS } from "./proj_registry";

initializeProjRegistry();

export interface ValidationWorkerParams {
  refBuffer: ArrayBuffer;
  predData: Float32Array;
  predWidth: number;
  predHeight: number;
  predCrs: string | null;
  predTransform: number[] | null; // [x0, dx, xskew, y0, yskew, dy]
  predNodata?: number;
  confData: Uint8Array | null;
  nodataOverride?: number;
  confThreshold: number; // e.g. 0.8
}

export interface ValidationMetrics {
  rmse: number;
  mae: number;
  bias: number;
  pearson: number;
  minError: number;
  maxError: number;
  p90: number;
  p95: number;
  validPixels: number;
}

export interface ValidationResult {
  all: ValidationMetrics;
  confident: ValidationMetrics | null;
  biasCorrectedRmse: number;
  overlapPercent: number;
  errorMap: Float32Array; // same size as predData, with NaN for nodata
  histogram: { binStart: number; binEnd: number; count: number }[];
  scatter: { x: number; y: number; count: number }[]; // 100x100 density
}

self.onmessage = async (e: MessageEvent<ValidationWorkerParams>) => {
  try {
    const p = e.data;
    
    // 1. Parse Reference GeoTIFF
    const tiff = await fromArrayBuffer(p.refBuffer);
    const image = await tiff.getImage();
    const refWidth = image.getWidth();
    const refHeight = image.getHeight();
    const geoKeys = image.getGeoKeys();
    
    let refCrs: string | null = null;
    if (geoKeys && geoKeys.ProjectedCSTypeGeoKey) {
      refCrs = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
    } else if (geoKeys && geoKeys.GeographicTypeGeoKey) {
      refCrs = `EPSG:${geoKeys.GeographicTypeGeoKey}`;
    }

    const fd = image.getFileDirectory();
    let refTransform: number[] | null = null;
    if (fd.ModelPixelScale && fd.ModelTiepoint) {
      refTransform = [
        fd.ModelTiepoint[3] - fd.ModelTiepoint[0] * fd.ModelPixelScale[0],
        fd.ModelPixelScale[0],
        0,
        fd.ModelTiepoint[4] - fd.ModelTiepoint[1] * -fd.ModelPixelScale[1], // Assuming negative Y scale
        0,
        -fd.ModelPixelScale[1]
      ];
    } else if (fd.ModelTransformation) {
      const mt = fd.ModelTransformation;
      refTransform = [mt[3], mt[0], mt[1], mt[7], mt[4], mt[5]];
    }

    let refNodata = p.nodataOverride;
    if (refNodata === undefined && fd.GDAL_NODATA) {
      refNodata = parseFloat(fd.GDAL_NODATA as string);
    }

    const rasters = await image.readRasters();
    const refData = rasters[0] as Float32Array | Int16Array | Uint16Array | Float64Array;

    if (!p.predTransform) {
      throw new Error("Predicted DSM lacks georeference transform metadata.");
    }
    if (!refTransform) {
      throw new Error("Reference GeoTIFF lacks georeference transform metadata.");
    }
    if (!p.predCrs) {
      throw new Error("Predicted DSM lacks CRS metadata.");
    }
    if (!refCrs) {
      throw new Error("Reference GeoTIFF lacks CRS metadata.");
    }

    // Set up projection
    let projFunc: ((coords: [number, number]) => [number, number]) | null = null;
    if (p.predCrs !== refCrs) {
      if (!hasCRS(p.predCrs)) throw new Error(`Predicted CRS ${p.predCrs} is not recognized or offline.`);
      if (!hasCRS(refCrs)) throw new Error(`Reference CRS EPSG:${refCrs} differs from prediction EPSG:${p.predCrs} and could not be reprojected.`);
      
      const transformFunc = proj4(p.predCrs, refCrs);
      projFunc = (coords: [number, number]) => transformFunc.forward(coords) as [number, number];
    }

    // Prepare arrays
    const errorMap = new Float32Array(p.predWidth * p.predHeight);
    errorMap.fill(NaN);

    let sumDiff = 0, sumSqDiff = 0, sumAbsDiff = 0;
    let minErr = Infinity, maxErr = -Infinity;
    
    let sumPred = 0, sumRef = 0;
    let sumPredRef = 0, sumPredSq = 0, sumRefSq = 0;
    let validCount = 0;

    let confSumDiff = 0, confSumSqDiff = 0, confSumAbsDiff = 0;
    let confMinErr = Infinity, confMaxErr = -Infinity;
    let confSumPred = 0, confSumRef = 0;
    let confSumPredRef = 0, confSumPredSq = 0, confSumRefSq = 0;
    let confValidCount = 0;

    const absErrors: number[] = [];
    const confAbsErrors: number[] = [];

    // Histogram arrays (pred vs ref)
    const scatterBins = new Float32Array(100 * 100);
    let minRefVal = Infinity, maxRefVal = -Infinity;
    let minPredVal = Infinity, maxPredVal = -Infinity;

    // Resampling & Diff Computation loop
    for (let py = 0; py < p.predHeight; py++) {
      for (let px = 0; px < p.predWidth; px++) {
        const pIdx = py * p.predWidth + px;
        const predVal = p.predData[pIdx];

        if (!Number.isFinite(predVal) || predVal === p.predNodata) continue;

        // Geo-coordinates of predicted pixel center
        const gx = p.predTransform[0] + (px + 0.5) * p.predTransform[1] + (py + 0.5) * p.predTransform[2];
        const gy = p.predTransform[3] + (px + 0.5) * p.predTransform[4] + (py + 0.5) * p.predTransform[5];

        let rx = gx, ry = gy;
        if (projFunc) {
          [rx, ry] = projFunc([gx, gy]);
        }

        // Map geo back to reference pixel coordinates
        // rx = refT[0] + x * refT[1] + y * refT[2]
        // ry = refT[3] + x * refT[4] + y * refT[5]
        // Invert it (assuming no skew for simplicity for now):
        const refPx = (rx - refTransform[0]) / refTransform[1] - 0.5;
        const refPy = (ry - refTransform[3]) / refTransform[5] - 0.5;

        // Bilinear interpolation
        const ix = Math.floor(refPx);
        const iy = Math.floor(refPy);

        if (ix >= 0 && ix < refWidth - 1 && iy >= 0 && iy < refHeight - 1) {
          const tx = refPx - ix;
          const ty = refPy - iy;

          const v00 = refData[iy * refWidth + ix];
          const v10 = refData[iy * refWidth + ix + 1];
          const v01 = refData[(iy + 1) * refWidth + ix];
          const v11 = refData[(iy + 1) * refWidth + ix + 1];

          // Nodata checks
          if (
            v00 === refNodata || v10 === refNodata || v01 === refNodata || v11 === refNodata ||
            !Number.isFinite(v00) || !Number.isFinite(v10) || !Number.isFinite(v01) || !Number.isFinite(v11)
          ) {
            continue;
          }

          const v0 = v00 * (1 - tx) + v10 * tx;
          const v1 = v01 * (1 - tx) + v11 * tx;
          const refVal = v0 * (1 - ty) + v1 * ty;

          const diff = predVal - refVal;
          errorMap[pIdx] = diff;
          
          absErrors.push(Math.abs(diff));
          
          sumDiff += diff;
          sumSqDiff += diff * diff;
          sumAbsDiff += Math.abs(diff);
          if (diff < minErr) minErr = diff;
          if (diff > maxErr) maxErr = diff;

          sumPred += predVal;
          sumRef += refVal;
          sumPredRef += predVal * refVal;
          sumPredSq += predVal * predVal;
          sumRefSq += refVal * refVal;
          validCount++;

          if (refVal < minRefVal) minRefVal = refVal;
          if (refVal > maxRefVal) maxRefVal = refVal;
          if (predVal < minPredVal) minPredVal = predVal;
          if (predVal > maxPredVal) maxPredVal = predVal;

          if (p.confData) {
            const conf = p.confData[pIdx] / 255.0;
            if (conf >= p.confThreshold) {
              confSumDiff += diff;
              confSumSqDiff += diff * diff;
              confSumAbsDiff += Math.abs(diff);
              if (diff < confMinErr) confMinErr = diff;
              if (diff > confMaxErr) confMaxErr = diff;
              confSumPred += predVal;
              confSumRef += refVal;
              confSumPredRef += predVal * refVal;
              confSumPredSq += predVal * predVal;
              confSumRefSq += refVal * refVal;
              confValidCount++;
              confAbsErrors.push(Math.abs(diff));
            }
          }
        }
      }
    }

    const overlapPercent = validCount > 0 ? (validCount / (p.predWidth * p.predHeight)) * 100 : 0;
    if (overlapPercent < 50) {
      throw new Error(`Insufficient overlap: only ${overlapPercent.toFixed(1)}% of predicted area has valid reference data.`);
    }

    // Sorting for percentiles
    absErrors.sort((a, b) => a - b);
    confAbsErrors.sort((a, b) => a - b);

    const calcMetrics = (vc: number, sd: number, sqd: number, sad: number, me: number, mxe: number, pS: number, rS: number, pRS: number, pSq: number, rSq: number, arr: number[]) => {
      if (vc === 0) return null;
      const rmse = Math.sqrt(sqd / vc);
      const mae = sad / vc;
      const bias = sd / vc;
      const n = vc;
      const num = n * pRS - pS * rS;
      const den = Math.sqrt((n * pSq - pS * pS) * (n * rSq - rS * rS));
      const pearson = den === 0 ? 0 : num / den;
      
      const p90 = arr[Math.floor(vc * 0.9)] || 0;
      const p95 = arr[Math.floor(vc * 0.95)] || 0;

      return { rmse, mae, bias, pearson, minError: me, maxError: mxe, p90, p95, validPixels: vc };
    };

    const allM = calcMetrics(validCount, sumDiff, sumSqDiff, sumAbsDiff, minErr, maxErr, sumPred, sumRef, sumPredRef, sumPredSq, sumRefSq, absErrors);
    const confM = calcMetrics(confValidCount, confSumDiff, confSumSqDiff, confSumAbsDiff, confMinErr, confMaxErr, confSumPred, confSumRef, confSumPredRef, confSumPredSq, confSumRefSq, confAbsErrors);

    // Bias-corrected RMSE (RMSE after removing mean bias)
    let biasCorrectedRmse = 0;
    if (allM) {
      let bSumSq = 0;
      for (let i = 0; i < p.predData.length; i++) {
        if (!Number.isNaN(errorMap[i])) {
          const bErr = errorMap[i] - allM.bias;
          bSumSq += bErr * bErr;
        }
      }
      biasCorrectedRmse = Math.sqrt(bSumSq / validCount);
    }

    // Compute scatter and histogram bins
    const histBins = 50;
    const histMin = Math.max(-20, allM!.bias - 3 * allM!.rmse);
    const histMax = Math.min(20, allM!.bias + 3 * allM!.rmse);
    const histStep = (histMax - histMin) / histBins;
    const histogram = Array(histBins).fill(0).map((_, i) => ({
      binStart: histMin + i * histStep,
      binEnd: histMin + (i + 1) * histStep,
      count: 0
    }));

    const scatterBinsCount = 100;
    const sMin = Math.min(minRefVal, minPredVal);
    const sMax = Math.max(maxRefVal, maxPredVal);
    const sStep = (sMax - sMin) / scatterBinsCount;
    
    // Pass 2: populate bins
    for (let i = 0; i < errorMap.length; i++) {
      const e = errorMap[i];
      if (!Number.isNaN(e)) {
        let binIdx = Math.floor((e - histMin) / histStep);
        if (binIdx < 0) binIdx = 0;
        if (binIdx >= histBins) binIdx = histBins - 1;
        histogram[binIdx].count++;
        
        // 2D density
        const predVal = p.predData[i];
        const refVal = predVal - e; // e = pred - ref
        
        let bx = Math.floor((refVal - sMin) / sStep);
        let by = Math.floor((predVal - sMin) / sStep);
        if (bx < 0) bx = 0;
        if (bx >= scatterBinsCount) bx = scatterBinsCount - 1;
        if (by < 0) by = 0;
        if (by >= scatterBinsCount) by = scatterBinsCount - 1;
        
        scatterBins[by * scatterBinsCount + bx]++;
      }
    }

    const scatter: { x: number; y: number; count: number }[] = [];
    for (let y = 0; y < scatterBinsCount; y++) {
      for (let x = 0; x < scatterBinsCount; x++) {
        const count = scatterBins[y * scatterBinsCount + x];
        if (count > 0) {
          scatter.push({
            x: sMin + (x + 0.5) * sStep,
            y: sMin + (y + 0.5) * sStep,
            count
          });
        }
      }
    }

    // Generate Error Texture (RGBA)
    const errorTexture = new Uint8Array(p.predWidth * p.predHeight * 4);
    // Diverging colormap: blue (negative) -> transparent (zero) -> red (positive)
    // Scale max error to say, 3 * RMSE for visual bounds
    const maxVisErr = (allM ? allM.rmse * 3 : 10) || 10;
    
    for (let i = 0; i < errorMap.length; i++) {
      const e = errorMap[i];
      const idx = i * 4;
      if (Number.isNaN(e)) {
        errorTexture[idx] = 0;
        errorTexture[idx + 1] = 0;
        errorTexture[idx + 2] = 0;
        errorTexture[idx + 3] = 0; // transparent
      } else {
        const norm = Math.max(-1, Math.min(1, e / maxVisErr)); // -1 to 1
        if (norm < 0) {
          // Negative (blue)
          errorTexture[idx] = 0;
          errorTexture[idx + 1] = 100;
          errorTexture[idx + 2] = 255;
          errorTexture[idx + 3] = Math.floor(Math.abs(norm) * 200 + 55); // Alpha
        } else {
          // Positive (red)
          errorTexture[idx] = 255;
          errorTexture[idx + 1] = 50;
          errorTexture[idx + 2] = 0;
          errorTexture[idx + 3] = Math.floor(norm * 200 + 55); // Alpha
        }
      }
    }

    self.postMessage({
      status: "done",
      result: {
        all: allM,
        confident: confM,
        biasCorrectedRmse,
        overlapPercent,
        errorMap,
        histogram,
        scatter,
        errorTexture,
        maxVisErr
      }
    }, { transfer: [errorMap.buffer, errorTexture.buffer] });

  } catch (err: any) {
    self.postMessage({ status: "error", error: err.message });
  }
};
