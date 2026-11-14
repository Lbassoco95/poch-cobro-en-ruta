import type { ReactNode } from "react";

const ICONO = { info: "ℹ", ok: "✔", ambar: "⚠", mal: "⚠" } as const;

export function Aviso({
  tono = "mal",
  texto,
  children,
  bloque = false,
}: {
  tono?: "info" | "ok" | "ambar" | "mal";
  texto?: string;
  children?: ReactNode;
  bloque?: boolean;
}) {
  const cuerpo = children ?? texto;
  if (!cuerpo) return null;
  const rol = tono === "ok" || tono === "info" ? "status" : "alert";
  return (
    <div className={`aviso-box ${tono}${bloque ? " bloque" : ""}`} role={rol}>
      <span className="ic" aria-hidden="true">{ICONO[tono]}</span>
      {bloque ? <div>{cuerpo}</div> : <span>{cuerpo}</span>}
    </div>
  );
}
