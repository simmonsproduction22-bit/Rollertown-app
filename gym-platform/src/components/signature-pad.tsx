"use client";
import { useRef, useState } from "react";

/** Finger/mouse signature → SVG path, posted in a hidden input. Typed-name fallback for accessibility. */
export function SignaturePad({ name = "signature" }: { name?: string }) {
  const [d, setD] = useState("");
  const [typed, setTyped] = useState("");
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const point = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return `${Math.round(((e.clientX - r.left) / r.width) * 300)} ${Math.round(((e.clientY - r.top) / r.height) * 100)}`;
  };
  const path = d || (typed ? "" : "");
  const svg = d
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><path d="${d}" stroke="black" fill="none" stroke-width="2.5"/></svg>`
    : typed ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><text x="10" y="60" font-size="28" font-family="cursive">${typed.replace(/[<>&"']/g, "")}</text></svg>` : "";
  return (
    <div>
      <span className="label">Sign below</span>
      <svg ref={svgRef} viewBox="0 0 300 100" className="h-32 w-full touch-none rounded-lg border border-line bg-white" role="img" aria-label="Signature area"
        onPointerDown={(e) => { drawing.current = true; (e.target as Element).setPointerCapture(e.pointerId); setD((p) => `${p} M ${point(e)}`); }}
        onPointerMove={(e) => { if (drawing.current) setD((p) => `${p} L ${point(e)}`); }}
        onPointerUp={() => { drawing.current = false; }}>
        <path d={path} stroke="black" fill="none" strokeWidth={2.5} />
      </svg>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => setD("")} className="text-sm text-muted underline">Clear</button>
        <label className="flex-1 text-sm"><span className="sr-only">Or type your full name as signature</span><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type your name to sign" className="input min-h-9" /></label>
      </div>
      <input type="hidden" name={name} value={svg} />
    </div>
  );
}
