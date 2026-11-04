// Daily line chart, hand-written SVG (R26–R34). The scale follows the data; the limit line is drawn only when it
// falls inside the scale, otherwise its value is written above the chart (owner's choice, 2026-11-04).
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { DayPoint } from "../api";
import { formatDay, TEXT_NO_DATA } from "../format";

export const TEXT_NO_CHART_DATA = "Aún no hay datos para esta gráfica.";
export const TEXT_TODAY = "Hoy (parcial)";
export const TEXT_RESCALED = "Escala recalculada para el consumo actual";

/** Width before the chart is measured (and in tests); the SVG then takes its frame's real width, so text and
 * lines keep their size on any screen instead of being scaled with the drawing. */
const DEFAULT_WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 72 };
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/** The smallest of 1, 2, 2.5 or 5 × 10ⁿ at or above `value`, so the axis reads in round figures. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value - 1e-9)!;
  return step * power;
}

/** Top of the scale for every series shown with the same axis. */
export function scaleTop(series: DayPoint[][]): number {
  return niceCeil(Math.max(0, ...series.flat().map((p) => p.value ?? 0)));
}

export const hasData = (points: DayPoint[]) => points.some((p) => p.value !== null);

const plotWidth = (width: number) => width - PAD.left - PAD.right;
const x = (i: number, count: number, width: number) => PAD.left + (count > 1 ? (i / (count - 1)) * plotWidth(width) : plotWidth(width) / 2);
const y = (value: number, top: number) => PAD.top + PLOT_H - (value / top) * PLOT_H;
const r = (n: number) => Math.round(n * 10) / 10;

/**
 * The line in two paths: complete days solid, the step into today's partial figure dashed (R27). A day without a
 * figure breaks the line, never drops to 0 (R33); a lone day becomes a dot.
 */
export function linePaths(points: DayPoint[], top: number, width = DEFAULT_WIDTH): { solid: string; partial: string } {
  const solid: string[] = [];
  let drawing = false;
  points.forEach((p, i) => {
    if (p.partial || p.value === null) {
      drawing = false;
      return;
    }
    const next = points[i + 1];
    const alone = !drawing && (!next || next.partial || next.value === null);
    solid.push(`${drawing ? "L" : "M"}${r(x(i, points.length, width))} ${r(y(p.value, top))}${alone ? "h0" : ""}`);
    drawing = true;
  });

  const last = points.length - 1;
  const today = points[last];
  const before = points[last - 1];
  let partial = "";
  if (today?.partial && today.value !== null) {
    const end = `${r(x(last, points.length, width))} ${r(y(today.value, top))}`;
    partial = before && !before.partial && before.value !== null ? `M${r(x(last - 1, points.length, width))} ${r(y(before.value, top))}L${end}` : `M${end}h0`;
  }
  return { solid: solid.join(""), partial };
}

const valueText = (value: number | null, format: (value: number | null) => string) => (value === null ? TEXT_NO_DATA : format(value));

/** R32: the readout of one day, in es-EC. */
export function pointText(point: DayPoint, format: (value: number | null) => string): string {
  return `${point.partial ? TEXT_TODAY : formatDay(point.day)} · ${valueText(point.value, format)}`;
}

export interface ChartSeries {
  name: string;
  points: DayPoint[];
}

/**
 * One series by `points`, or several by `series` (one per account, same days). Several series get a legend and
 * their own validated colors, so identity never rests on color alone; the readout lists every series at that day.
 */
export function LineChart({ points, series, format, limit, label }: {
  points?: DayPoint[];
  series?: ChartSeries[];
  format: (value: number | null) => string;
  /** R28: dashed "Límite" line; omitted for charts without a limit. */
  limit?: number;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(320, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lines = series ?? [{ name: label, points: points ?? [] }];
  const several = lines.length > 1;
  if (!lines.some((l) => hasData(l.points))) return <p className="note">{TEXT_NO_CHART_DATA}</p>;

  const days = lines[0]!.points;
  const scale = scaleTop(lines.map((l) => l.points));
  const at = (i: number) => r(x(i, days.length, width));
  const limitShown = limit !== undefined && limit <= scale;
  const last = days.length - 1;
  const ticks = [0, scale / 2, scale];
  // A narrow chart keeps only the first and last dates, so they never run into each other.
  const xLabels = width < 480 ? [0, last] : [0, Math.floor(last / 2), last];

  // The crosshair snaps to the nearest day, so the reader aims at a date, never at the 2 px line.
  const track = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = box.width ? (event.clientX - box.left) / box.width : 0;
    setActive(Math.min(last, Math.max(0, Math.round(share * last))));
  };
  const seriesClass = (n: number) => (several ? `series s${n + 1}` : "series");

  return (
    <figure className="line-chart">
      {limit !== undefined && !limitShown ? (
        <figcaption className="note">
          Límite: {format(limit)} <span className="rescaled">({TEXT_RESCALED})</span>
        </figcaption>
      ) : null}
      {several ? (
        <ul className="legend">
          {lines.map((l, n) => (
            <li key={l.name}>
              <svg className={seriesClass(n)} width="16" height="8" aria-hidden="true">
                <line x1="1" x2="15" y1="4" y2="4" />
              </svg>
              {l.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="line-chart-frame" ref={frame}>
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={r(y(t, scale))} y2={r(y(t, scale))} />
              <text className="axis" x={PAD.left - 8} y={r(y(t, scale))} textAnchor="end" dominantBaseline="middle">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i, n) => (
            <text key={i} className="axis" x={at(i)} y={HEIGHT - 8} textAnchor={n === 0 ? "start" : n === xLabels.length - 1 ? "end" : "middle"}>
              {days[i]!.partial ? TEXT_TODAY : formatDay(days[i]!.day).slice(0, 5)}
            </text>
          ))}
          {limitShown ? (
            <g className="limit">
              <line x1={PAD.left} x2={width - PAD.right} y1={r(y(limit, scale))} y2={r(y(limit, scale))} />
              <text x={width - PAD.right} y={r(y(limit, scale)) - 6} textAnchor="end">
                Límite
              </text>
            </g>
          ) : null}
          {lines.map((l, n) => {
            const { solid, partial } = linePaths(l.points, scale, width);
            return (
              <g key={l.name} className={seriesClass(n)}>
                <path d={solid} />
                {partial ? <path className="partial" d={partial} /> : null}
              </g>
            );
          })}
          {active !== null ? (
            <g className="cursor">
              <line x1={at(active)} x2={at(active)} y1={PAD.top} y2={PAD.top + PLOT_H} />
              {lines.map((l, n) => {
                const value = l.points[active]?.value ?? null;
                return value === null ? null : <circle key={l.name} className={seriesClass(n)} cx={at(active)} cy={r(y(value, scale))} r={4} />;
              })}
            </g>
          ) : null}
          <rect
            className="hit"
            x={PAD.left - 8}
            y={PAD.top}
            width={plotWidth(width) + 16}
            height={PLOT_H}
            onPointerMove={track}
            onPointerDown={track}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {active !== null ? (
          <div className="chart-tip" role="status" style={{ left: `${(at(active) / width) * 100}%` }}>
            {several ? (
              <>
                <div>{days[active]!.partial ? TEXT_TODAY : formatDay(days[active]!.day)}</div>
                {lines.map((l) => (
                  <div key={l.name}>
                    {valueText(l.points[active]?.value ?? null, format)} <span className="tip-name">{l.name}</span>
                  </div>
                ))}
              </>
            ) : (
              pointText(days[active]!, format)
            )}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
