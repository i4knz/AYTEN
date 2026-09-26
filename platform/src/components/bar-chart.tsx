// Single-series bar chart for daily values. Server-rendered SVG.
// One hue (brand), 4px rounded data-ends, recessive grid, hover highlight with
// a value label and a native tooltip, and a hidden table for screen readers.

export function BarChart({
  data,
  format,
  label,
}: {
  data: { key: string; label: string; value: number }[];
  format: (v: number) => string;
  label: string;
}) {
  const W = 640;
  const H = 180;
  const pad = { top: 24, bottom: 22, side: 4 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const slot = (W - pad.side * 2) / Math.max(n, 1);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const plotH = H - pad.top - pad.bottom;
  const labelEvery = Math.ceil(n / 8);
  const gridValues = [0.5, 1].map((f) => f * max);

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={label} style={{ direction: "ltr" }}>
        {gridValues.map((g) => {
          const y = pad.top + plotH - (g / max) * plotH;
          return <line key={g} x1={0} x2={W} y1={y} y2={y} className="stroke-line" strokeWidth={1} strokeDasharray="3 4" />;
        })}
        <line x1={0} x2={W} y1={pad.top + plotH} y2={pad.top + plotH} className="stroke-line" strokeWidth={1} />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(3, (d.value / max) * plotH) : 0;
          const x = pad.side + i * slot + (slot - barW) / 2;
          const y = pad.top + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.key} className="group">
              <title>{`${d.label}: ${format(d.value)}`}</title>
              <rect x={pad.side + i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  className="fill-brand opacity-85 transition-opacity group-hover:opacity-100"
                />
              )}
              <text x={x + barW / 2} y={Math.max(12, y - 6)} textAnchor="middle" className="hidden fill-ink text-[11px] font-semibold group-hover:block">
                {format(d.value)}
              </text>
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-ink-soft text-[10px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
