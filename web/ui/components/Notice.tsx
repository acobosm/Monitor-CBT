import type { ReactNode } from "react";
import type { Level } from "../api";

export function Notice({ level, children }: { level: Level; children: ReactNode }) {
  return (
    <p className={`notice level-${level}`} role={level === "normal" ? undefined : "status"}>
      {children}
    </p>
  );
}
