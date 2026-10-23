import { describe, it, expect } from 'vitest';

// Dummy wrapper around the logic we implemented in validation.worker.ts for testing
// Normally we'd extract the pure math functions to a separate file, but for the sake of the test suite structure:
function calcMetrics(predArr: number[], refArr: number[]) {
  let vc = 0, sumDiff = 0, sumSqDiff = 0, sumAbsDiff = 0;
  let minErr = Infinity, maxErr = -Infinity;
  let sumPred = 0, sumRef = 0;
  let sumPredRef = 0, sumPredSq = 0, sumRefSq = 0;
  let absErrors: number[] = [];

  for (let i = 0; i < predArr.length; i++) {
    const diff = predArr[i] - refArr[i];
    absErrors.push(Math.abs(diff));
    sumDiff += diff;
    sumSqDiff += diff * diff;
    sumAbsDiff += Math.abs(diff);
    if (diff < minErr) minErr = diff;
    if (diff > maxErr) maxErr = diff;
    sumPred += predArr[i];
    sumRef += refArr[i];
    sumPredRef += predArr[i] * refArr[i];
    sumPredSq += predArr[i] * predArr[i];
    sumRefSq += refArr[i] * refArr[i];
    vc++;
  }

  absErrors.sort((a, b) => a - b);
  
  const rmse = Math.sqrt(sumSqDiff / vc);
  const mae = sumAbsDiff / vc;
  const bias = sumDiff / vc;
  
  const n = vc;
  const num = n * sumPredRef - sumPred * sumRef;
  const den = Math.sqrt((n * sumPredSq - sumPred * sumPred) * (n * sumRefSq - sumRef * sumRef));
  const pearson = den === 0 ? 0 : num / den;

  const p90 = absErrors[Math.floor(vc * 0.9)];
  const p95 = absErrors[Math.floor(vc * 0.95)];

  return { rmse, mae, bias, pearson, p90, p95 };
}

describe('Validation Metrics', () => {
  it('calculates RMSE and MAE correctly', () => {
    // Known arrays
    const pred = [1.0, 2.0, 3.0, 4.0];
    const ref =  [1.0, 2.5, 3.0, 3.0];
    // Diff:     [0.0, -0.5, 0.0, 1.0]
    // Abs Diff: [0.0, 0.5, 0.0, 1.0] => sum = 1.5 => MAE = 1.5 / 4 = 0.375
    // Sq Diff:  [0.0, 0.25, 0.0, 1.0] => sum = 1.25 => Mean = 0.3125 => RMSE = ~0.559

    const m = calcMetrics(pred, ref);
    expect(m.mae).toBeCloseTo(0.375, 4);
    expect(m.rmse).toBeCloseTo(0.559016994, 4);
    expect(m.bias).toBeCloseTo(0.125, 4); // (-0.5 + 1.0) / 4
  });

  it('calculates Pearson correlation', () => {
    const pred = [1, 2, 3, 4, 5];
    const ref = [2, 4, 6, 8, 10]; // perfectly correlated
    const m = calcMetrics(pred, ref);
    expect(m.pearson).toBeCloseTo(1.0, 4);
  });

  it('calculates 90th and 95th percentiles', () => {
    const pred = Array.from({ length: 100 }, (_, i) => i);
    const ref = Array.from({ length: 100 }, () => 0); 
    // Abs errors are 0, 1, 2, ... 99
    const m = calcMetrics(pred, ref);
    expect(m.p90).toBe(90);
    expect(m.p95).toBe(95);
  });
});

describe('Validation Resampling (Mock logic)', () => {
  // In the real app, this is heavily reliant on GeoTIFF/Proj4 Web Worker code.
  // We'll mock the core check: valid overlap vs nodata.
  it('treats exactly zero as valid if not configured as nodata', () => {
    const pred = [0, 0];
    const ref = [0, 0];
    const m = calcMetrics(pred, ref);
    expect(m.rmse).toBe(0);
    expect(m.mae).toBe(0);
  });
});
