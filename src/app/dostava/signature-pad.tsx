"use client";

import * as React from "react";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

/** Hand-rolled — pointer events onto a canvas, no library, same "build the small thing" call as the Klet sugar chart. */
export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const drawingRef = React.useRef(false);
    const hasInkRef = React.useRef(false);
    const [, forceRender] = React.useReducer((c) => c + 1, 0);

    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1a1a1a";
      }
    }, []);

    function point(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      drawingRef.current = true;
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const p = point(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!hasInkRef.current) {
        hasInkRef.current = true;
        forceRender();
      }
    }

    function onPointerUp() {
      drawingRef.current = false;
    }

    React.useImperativeHandle(ref, () => ({
      isEmpty: () => !hasInkRef.current,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasInkRef.current = false;
        forceRender();
      },
    }));

    return (
      <div className={className}>
        <div className="relative rounded-[var(--radius-control)] border border-line bg-surface overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            className="w-full h-[140px] touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {!hasInkRef.current && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-[12.5px] text-ink-subtle">
              Podpis stranke
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasInkRef.current = false;
            forceRender();
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-subtle hover:text-ink"
        >
          <Eraser className="size-3.5" /> Počisti
        </button>
      </div>
    );
  },
);
