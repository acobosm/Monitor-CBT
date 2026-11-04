import type { ReactNode } from "react";
import type { Level } from "../api";
import { formatPercent, TEXT_NO_DATA } from "../format";
import { StatusBadge } from "./StatusBadge";

/** Width of the bar: full at 100 % or more, the real percentage stays in the text (R20). */
export function meterWidth(percent: number | null): number {
  return percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
}

/**
 * Usage bar of one metric (R18–R21). The words carry the meaning; the bar and its color only reinforce them, so
 * the bar is hidden from screen readers. `percent` null means the figure is missing: empty bar and "Sin dato".
 */
export function Meter({ label, info, usage, limit, percent, level, stateText }: {
  label: string;
  info?: ReactNode;
  usage: string;
  limit: string;
  percent: number | null;
  level: Level;
  stateText: string;
}) {
  const missing = percent === null;
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">
          {label}
          {info}
        </span>
        <StatusBadge level={missing ? "normal" : level} text={missing ? TEXT_NO_DATA : stateText} />
      </div>
      <div className="meter-track" aria-hidden="true">
        <div className={`meter-fill level-${level}`} style={{ width: `${meterWidth(percent)}%` }} />
      </div>
      <p className="note">{missing ? TEXT_NO_DATA : `${usage} de ${limit} · ${formatPercent(percent)}`}</p>
    </div>
  );
}
