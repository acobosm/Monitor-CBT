// Animated node network of the "CBT Monitoreo" landing (R9, R10): same starting layout on every load.
import { useEffect, useRef } from "react";
import { seeded } from "./Circuit";

const MAX_NODES = 70;
const AREA_PER_NODE = 14000;
const LINK_DISTANCE = 130;

type NetworkNode = { x: number; y: number; vx: number; vy: number; color: string };

/** What the network uses from the browser; tests pass a fake. */
export type NetworkWindow = Pick<Window, "devicePixelRatio" | "matchMedia" | "requestAnimationFrame" | "cancelAnimationFrame" | "addEventListener" | "removeEventListener">;

export function makeNodes(width: number, height: number): NetworkNode[] {
  const random = seeded(7);
  const count = Math.round(Math.min(MAX_NODES, (width * height) / AREA_PER_NODE));
  const nodes: NetworkNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      x: random() * width,
      y: random() * height,
      vx: (random() - 0.5) * 0.25,
      vy: (random() - 0.5) * 0.25,
      color: random() < 0.2 ? "#4fb4de" : random() < 0.15 ? "#a8aeb4" : "#9fb0f2",
    });
  }
  return nodes;
}

/** Moves every node one step; a node leaving the area turns back. */
export function moveNodes(nodes: NetworkNode[], width: number, height: number): void {
  for (const node of nodes) {
    node.x += node.vx;
    node.y += node.vy;
    if (node.x < 0 || node.x > width) node.vx *= -1;
    if (node.y < 0 || node.y > height) node.vy *= -1;
  }
}

function draw(context: CanvasRenderingContext2D, nodes: NetworkNode[], width: number, height: number): void {
  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;
  nodes.forEach((a, i) => {
    for (const b of nodes.slice(i + 1)) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance >= LINK_DISTANCE) continue;
      context.strokeStyle = `rgba(79,180,222,${0.35 * (1 - distance / LINK_DISTANCE)})`;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  });
  context.lineWidth = 2;
  for (const node of nodes) {
    context.strokeStyle = node.color;
    context.beginPath();
    context.arc(node.x, node.y, 4, 0, 2 * Math.PI);
    context.stroke();
  }
}

/** Starts the network and returns how to stop it. With reduced motion it is drawn once, still (R10). */
export function startNetwork(canvas: HTMLCanvasElement, win: NetworkWindow): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const still = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let frame = 0;

  const fit = () => {
    const box = canvas.getBoundingClientRect();
    const ratio = win.devicePixelRatio || 1;
    width = box.width;
    height = box.height;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  fit();
  const nodes = makeNodes(width, height);

  const animate = () => {
    moveNodes(nodes, width, height);
    draw(context, nodes, width, height);
    frame = win.requestAnimationFrame(animate);
  };
  const onResize = () => {
    fit();
    if (still) draw(context, nodes, width, height);
  };

  win.addEventListener("resize", onResize);
  if (still) draw(context, nodes, width, height);
  else animate();

  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener("resize", onResize);
  };
}

export function NodeNetwork() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvas.current ? startNetwork(canvas.current, window) : undefined), []);
  return <canvas ref={canvas} className="node-network" aria-hidden="true" />;
}
