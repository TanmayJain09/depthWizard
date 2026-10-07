import React, { useEffect, useRef } from 'react';

export interface ScatterPoint {
  x: number;
  y: number;
  count: number;
}

export function DensityScatter({ data, width = 250, height = 250 }: { data: ScatterPoint[], width?: number, height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let maxCount = 0;

    data.forEach(d => {
      if (d.x < minX) minX = d.x;
      if (d.x > maxX) maxX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.y > maxY) maxY = d.y;
      if (d.count > maxCount) maxCount = d.count;
    });

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    const pad = 20;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const scaleX = (val: number) => pad + ((val - minX) / (spanX || 1)) * innerW;
    const scaleY = (val: number) => height - pad - ((val - minY) / (spanY || 1)) * innerH;

    // Background
    ctx.fillStyle = '#0D1013'; // var(--bg-1) approx
    ctx.fillRect(0, 0, width, height);

    // 1:1 line
    ctx.strokeStyle = '#353A40'; // var(--fg-3) approx
    ctx.beginPath();
    ctx.moveTo(scaleX(Math.max(minX, minY)), scaleY(Math.max(minX, minY)));
    ctx.lineTo(scaleX(Math.min(maxX, maxY)), scaleY(Math.min(maxX, maxY)));
    ctx.stroke();

    // Draw points (density mapped to opacity and color)
    const binSizeX = Math.max(1, innerW / 100);
    const binSizeY = Math.max(1, innerH / 100);

    data.forEach(d => {
      // Sqrt scale for density
      const density = Math.sqrt(d.count) / Math.sqrt(maxCount);
      
      const r = Math.floor(255 * density);
      const g = Math.floor(106 * density + 150 * (1 - density)); // mix towards some base
      const b = Math.floor(43 * density + 200 * (1 - density));
      
      ctx.fillStyle = `rgba(${r}, 100, 200, ${density + 0.1})`;
      ctx.fillRect(scaleX(d.x) - binSizeX/2, scaleY(d.y) - binSizeY/2, binSizeX, binSizeY);
    });

    // Axes
    ctx.strokeStyle = '#6B747C';
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(width - pad, height - pad);
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, height - pad);
    ctx.stroke();

    ctx.fillStyle = '#6B747C';
    ctx.font = '10px monospace';
    ctx.fillText('Ref (m)', width / 2, height - 5);
    ctx.save();
    ctx.translate(10, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Pred (m)', 0, 0);
    ctx.restore();

  }, [data, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', borderRadius: '4px' }} />;
}
