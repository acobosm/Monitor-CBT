// Decorative circuit traces of the "CBT Monitoreo" prototype: fixed drawings, same on every load.

type Trace = { className: string; d: string; nodes: [number, number][] };

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Traces of the page background: straight runs with 45° elbows and a ring at each end. */
export function pageTraces(): Trace[] {
  const random = seeded(2026);
  const grid = 40;
  const traces: Trace[] = [];
  for (let n = 0; n < 38; n++) {
    let x = Math.round((random() * 1600) / grid) * grid;
    let y = Math.round((random() * 1000) / grid) * grid;
    const start: [number, number] = [x, y];
    const className = `c${1 + Math.floor(random() * 3)}`;
    const segments = 2 + Math.floor(random() * 3);
    let horizontal = random() < 0.5;
    let d = `M${x} ${y}`;
    for (let k = 0; k < segments; k++) {
      const length = (1 + Math.floor(random() * 4)) * grid;
      const sign = random() < 0.5 ? -1 : 1;
      if (horizontal) x += sign * length;
      else y += sign * length;
      d += `L${x} ${y}`;
      if (random() < 0.65) {
        const diagonal = grid * (1 + Math.floor(random() * 2));
        x += (random() < 0.5 ? -1 : 1) * diagonal;
        y += (random() < 0.5 ? -1 : 1) * diagonal;
        d += `L${x} ${y}`;
      }
      horizontal = !horizontal;
    }
    traces.push({ className, d, nodes: [start, [x, y]] });
  }
  return traces;
}

/** Traces of the side menu: some rise from the bottom, some enter from the right. */
export function sideTraces(): Trace[] {
  const classes = ["c1", "c2", "c3"];
  const traces: Trace[] = [];
  for (let i = 0; i < 5; i++) {
    const x = 24 + i * 16;
    const top = 770 - i * 34;
    const end = 560 - i * 42;
    traces.push({
      className: classes[i % 3]!,
      d: `M${x} 800V${top}L${x + 24} ${top - 24}V${end}`,
      nodes: [[x + 24, end]],
    });
  }
  for (let i = 0; i < 3; i++) {
    const y = 300 + i * 16;
    const x = 176 - i * 16;
    const end = y + 110 + i * 24;
    traces.push({
      className: classes[(i + 1) % 3]!,
      d: `M240 ${y}H${196 - i * 16}L${x} ${y + 20}V${end}`,
      nodes: [[x, end]],
    });
  }
  return traces;
}

function Traces({ traces, radius }: { traces: Trace[]; radius: number }) {
  return traces.map((trace, i) => (
    <g key={i} className={`trace ${trace.className}`}>
      <path d={trace.d} />
      {trace.nodes.map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={radius} />
      ))}
    </g>
  ));
}

export function PageCircuit() {
  return (
    <svg className="page-circuit" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <Traces traces={pageTraces()} radius={5} />
    </svg>
  );
}

export function SideCircuit() {
  return (
    <svg className="side-circuit" viewBox="0 0 240 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Traces traces={sideTraces()} radius={4} />
    </svg>
  );
}
