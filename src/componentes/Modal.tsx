import { useEffect, type ReactNode } from "react";

export function Modal({
  abierto,
  titulo,
  children,
  alCerrar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  alCerrar: () => void;
}) {
  useEffect(() => {
    if (!abierto) return;
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") alCerrar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, alCerrar]);

  if (!abierto) return null;
  return (
    <div className="velo" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
      <div className="modal">
        <h2 id="titulo-modal">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}
