"use client";

import * as React from "react";
import jsQR from "jsqr";

/**
 * Back-camera QR reader. jsQR runs in plain JS, so it also works in iPhone
 * Safari (which has no BarcodeDetector). Calls onCode once, then stops.
 */
export function QrScanner({ onCode, onError }: { onCode: (text: string) => void; onError: (msg: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const done = React.useRef(false);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        onError("Kamera ni dostopna. Dovolite dostop do kamere ali vpišite kodo ročno.");
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      tick();
    }

    function tick() {
      const v = videoRef.current;
      if (done.current || !v || !ctx) return;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        // scan the centre square, scaled down: fast enough on older phones
        const side = Math.min(v.videoWidth, v.videoHeight);
        const size = Math.min(side, 640);
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
        const img = ctx.getImageData(0, 0, size, size);
        const hit = jsQR(img.data, size, size, { inversionAttempts: "dontInvert" });
        if (hit?.data) {
          done.current = true;
          navigator.vibrate?.(60);
          onCode(hit.data);
          return;
        }
      }
      timer = window.setTimeout(tick, 180);
    }

    void start();
    return () => {
      done.current = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode, onError]);

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-black aspect-square">
      <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-[18%] rounded-[18px] border-[3px] border-white/85 shadow-[0_0_0_999px_rgb(0_0_0/0.35)]" />
      <p className="absolute bottom-3 inset-x-0 text-center text-[12.5px] font-semibold text-white/90">Usmerite kamero v QR kodo na kartici</p>
    </div>
  );
}
