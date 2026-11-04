// Small line of the daily visits, without axes or figures (R14). The detailed charts come in T6.
import type { DayPoint } from "../api";

const WIDTH = 100;
const HEIGHT = 32;

/**
 * SVG path of the complete days: a day without a figure breaks the line instead of dropping to 0, and today's
 * partial figure is left out so it never looks like a fall.
 */
export function sparklinePath(points: DayPoint[]): string {
  const values = points.map((p) => (p.partial ? null : p.value));
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const y = (v: number) => (max ? HEIGHT - (v / max) * HEIGHT : HEIGHT);

  const parts: string[] = [];
  let drawing = false;
  values.forEach((v, i) => {
    if (v === null) {
      drawing = false;
      return;
    }
    const point = `${round(i * step)} ${round(y(v))}`;
    // A lone day is drawn as a dot: a segment of zero length with round caps.
    const next = values[i + 1];
    parts.push(drawing ? `L${point}` : next === null || next === undefined ? `M${point}h0` : `M${point}`);
    drawing = true;
  });
  return parts.join("");
}

const round = (n: number) => Math.round(n * 100) / 100;

export function Sparkline({ points, label }: { points: DayPoint[]; label: string }) {
  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={sparklinePath(points)} />
    </svg>
  );
}
