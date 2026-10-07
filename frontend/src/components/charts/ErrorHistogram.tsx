import React from 'react';

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
}

export function ErrorHistogram({ data, width = 300, height = 150 }: { data: HistogramBin[], width?: number, height?: number }) {
  if (!data || data.length === 0) return null;

  const maxCount = Math.max(...data.map(d => d.count));
  const minX = data[0].binStart;
  const maxX = data[data.length - 1].binEnd;
  
  const padX = 20;
  const padY = 20;
  
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  
  const scaleX = (val: number) => padX + ((val - minX) / (maxX - minX)) * innerW;
  const scaleY = (val: number) => height - padY - (val / (maxCount || 1)) * innerH;

  const zeroX = scaleX(0);

  return (
    <svg width={width} height={height} style={{ display: 'block', background: 'var(--bg-1)', borderRadius: '4px' }}>
      {/* Zero line */}
      {zeroX >= padX && zeroX <= width - padX && (
        <line x1={zeroX} y1={padY} x2={zeroX} y2={height - padY} stroke="var(--fg-3)" strokeDasharray="4,4" />
      )}
      
      {/* Bars */}
      {data.map((b, i) => {
        const x1 = scaleX(b.binStart);
        const x2 = scaleX(b.binEnd);
        const y = scaleY(b.count);
        const isCenter = b.binStart <= 0 && b.binEnd >= 0;
        return (
          <rect
            key={i}
            x={x1}
            y={y}
            width={Math.max(1, x2 - x1 - 1)}
            height={height - padY - y}
            fill={isCenter ? "var(--accent)" : "var(--fg-2)"}
            opacity={0.8}
          />
        );
      })}
      
      {/* Axis */}
      <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="var(--fg-3)" />
      
      <text x={padX} y={height - 5} fontSize="10" fill="var(--fg-2)" className="mono-data">
        {minX.toFixed(1)}m
      </text>
      <text x={width - padX} y={height - 5} fontSize="10" fill="var(--fg-2)" textAnchor="end" className="mono-data">
        {maxX.toFixed(1)}m
      </text>
    </svg>
  );
}
