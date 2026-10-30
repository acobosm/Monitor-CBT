import type { Level } from "../api";

/** The word always carries the meaning; the color only reinforces it. */
export function StatusBadge({ level, text }: { level: Level; text: string }) {
  return <span className={`badge level-${level}`}>{text}</span>;
}
