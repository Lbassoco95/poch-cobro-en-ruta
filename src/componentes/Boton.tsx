import type { ReactNode } from "react";

type Variante = "primario" | "secundario" | "peligro" | "entrega";

const CLASE: Record<Variante, string> = {
  primario: "btn",
  secundario: "btn sec",
  peligro: "btn peligro",
  entrega: "btn ambar",
};

export function Boton({
  children,
  variante = "primario",
  chico = false,
  ocupado = false,
  tipo = "button",
  disabled = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  variante?: Variante;
  chico?: boolean;
  ocupado?: boolean;
  tipo?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const apagado = ocupado || disabled;
  return (
    <button
      type={tipo}
      className={`${CLASE[variante]}${chico ? " chico" : ""} ${className}`.trim()}
      onClick={onClick}
      disabled={apagado}
      aria-busy={ocupado}
    >
      {ocupado ? "Espere…" : children}
    </button>
  );
}
