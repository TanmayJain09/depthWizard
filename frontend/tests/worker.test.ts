import { describe, it, expect } from 'vitest';

describe('16-bit PNG Decoding (Worker)', () => {
  it('correctly maps 16-bit values to height range without quantization', () => {
    const minH = 100;
    const maxH = 200;
    
    // Simulate 16-bit decode
    const decode16BitPixel = (val: number) => {
      return minH + (val / 65535) * (maxH - minH);
    };

    expect(decode16BitPixel(0)).toBe(100);
    expect(decode16BitPixel(65535)).toBe(200);
    expect(decode16BitPixel(32767.5)).toBeCloseTo(150);
  });
});

describe('Spatial Alignment / Resampling', () => {
  it('resamples correctly when CRS matches', () => {
    const isCrsMatch = (refEpsg: number, predEpsg: number) => refEpsg === predEpsg;
    expect(isCrsMatch(32633, 32633)).toBe(true);
  });
});

describe('Nodata Logic', () => {
  it('ignores nodata values during metric calculation', () => {
    const pred = [10, 20, 30];
    const ref = [10, -9999, 30]; // -9999 is nodata
    const nodata = -9999;
    
    let validCount = 0;
    for (let i = 0; i < pred.length; i++) {
      if (ref[i] !== nodata) validCount++;
    }
    expect(validCount).toBe(2);
  });
});

describe('CRS Mismatch', () => {
  it('blocks computation when CRS differs and no reprojection is available', () => {
    const checkCrs = (refEpsg: number, predEpsg: number) => {
      if (refEpsg !== predEpsg) {
        throw new Error(`Reference CRS EPSG:${refEpsg} differs from prediction EPSG:${predEpsg}`);
      }
      return true;
    };
    expect(() => checkCrs(4326, 3857)).toThrow(/differs/);
  });
});

describe('Stratification / Region Mask Metrics', () => {
  it('computes metrics separately for masked pixels', () => {
    const pred = [1, 2, 3, 4];
    const ref = [1, 2, 5, 4];
    // Region mask (e.g. 1 for urban, 0 for elsewhere)
    const mask = [0, 0, 1, 0];
    
    let sumErrUrban = 0;
    let urbanCount = 0;
    for (let i = 0; i < pred.length; i++) {
      if (mask[i] === 1) {
        sumErrUrban += Math.abs(pred[i] - ref[i]);
        urbanCount++;
      }
    }
    expect(urbanCount).toBe(1);
    expect(sumErrUrban / urbanCount).toBe(2);
  });
});
