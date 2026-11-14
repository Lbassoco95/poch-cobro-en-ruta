import type { ReactNode } from "react";
import type { TipoInsignia } from "../lib/parada";

const TEXTOS: Record<TipoInsignia | "ok" | "falla" | "aviso", [string, string]> = {
  porcobrar: ["○", "Por cobrar"],
  pendiente: ["⏳", "Esperando pago"],
  pagado: ["✔", "Pagado"],
  vencido: ["✖", "Vencido"],
  cancelado: ["⊘", "Cancelado"],
  entregado: ["✔✔", "Entregado"],
  devuelto: ["⊘", "Devuelto"],
  ok: ["✔", "OK"],
  falla: ["✖", "FALLA"],
  aviso: ["", ""],
};

export function Insignia({
  tipo,
  children,
}: {
  tipo: TipoInsignia | "ok" | "falla" | "aviso";
  children?: ReactNode;
}) {
  const [simbolo, texto] = TEXTOS[tipo];
  const visible = children ?? texto;
  return (
    <span className={`ins ${tipo}`}>
      {simbolo ? <span aria-hidden="true">{simbolo}</span> : null}
      {visible}
    </span>
  );
}
