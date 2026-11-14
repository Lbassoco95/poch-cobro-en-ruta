import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

export type FirmaControl = {
  exportar: () => Promise<Blob | null>;
  limpiar: () => void;
};

export const CampoFirma = forwardRef<FirmaControl, { alCambiar: (hay: boolean) => void }>(
  function CampoFirma({ alCambiar }, ref) {
    const lienzoRef = useRef<HTMLCanvasElement>(null);
    const hay = useRef(false);
    const dibujando = useRef(false);
    const alCambiarRef = useRef(alCambiar);
    alCambiarRef.current = alCambiar;

    function preparar() {
      const canvas = lienzoRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const densidad = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * densidad));
      canvas.height = Math.max(1, Math.round(rect.height * densidad));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(densidad, 0, 0, densidad, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = "#9AA7C4";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(16, rect.height - 34);
      ctx.lineTo(rect.width - 16, rect.height - 34);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#6B7A9C";
      ctx.font = "16px Arial";
      ctx.fillText("✕", 16, rect.height - 40);
      hay.current = false;
      alCambiarRef.current(false);
    }

    useEffect(() => {
      preparar();
      const canvas = lienzoRef.current;
      if (!canvas) return;

      function punto(evento: PointerEvent) {
        const rect = canvas!.getBoundingClientRect();
        return { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
      }

      function abajo(evento: PointerEvent) {
        const ctx = canvas!.getContext("2d");
        if (!ctx) return;
        dibujando.current = true;
        canvas!.setPointerCapture(evento.pointerId);
        const p = punto(evento);
        ctx.strokeStyle = "#0C2340";
        ctx.lineWidth = 2.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 0.1, p.y + 0.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        if (!hay.current) {
          hay.current = true;
          alCambiarRef.current(true);
        }
        evento.preventDefault();
      }

      function mover(evento: PointerEvent) {
        if (!dibujando.current) return;
        const ctx = canvas!.getContext("2d");
        if (!ctx) return;
        const p = punto(evento);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      function arriba() {
        dibujando.current = false;
      }

      canvas.addEventListener("pointerdown", abajo);
      canvas.addEventListener("pointermove", mover);
      canvas.addEventListener("pointerup", arriba);
      canvas.addEventListener("pointercancel", arriba);
      return () => {
        canvas.removeEventListener("pointerdown", abajo);
        canvas.removeEventListener("pointermove", mover);
        canvas.removeEventListener("pointerup", arriba);
        canvas.removeEventListener("pointercancel", arriba);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      limpiar: preparar,
      exportar: () => new Promise((resolver) => {
        const canvas = lienzoRef.current;
        if (!canvas || !hay.current) {
          resolver(null);
          return;
        }
        canvas.toBlob((blob) => resolver(blob), "image/png");
      }),
    }));

    return (
      <canvas
        ref={lienzoRef}
        className="firma"
        role="img"
        aria-label="Espacio para la firma de quien recibe"
      />
    );
  },
);
