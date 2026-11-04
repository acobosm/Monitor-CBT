import { useId, useState } from "react";

/**
 * The (i) next to a label (R23): its message opens on mouse hover and keyboard focus through the CSS, and on touch
 * through the button, which also closes it on a second touch.
 */
export function InfoTip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip">
      <button type="button" aria-label="Más información" aria-describedby={id} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>
        i
      </button>
      <span id={id} role="tooltip">
        {text}
      </span>
    </span>
  );
}
