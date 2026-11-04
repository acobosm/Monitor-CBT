import type { ReactNode } from "react";

/** A surface with the design system's card look; the content decides its own layout. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={className ? `card ${className}` : "card"}>{children}</section>;
}
