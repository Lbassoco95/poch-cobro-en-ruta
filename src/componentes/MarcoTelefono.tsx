import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Pie } from "./Pie";

export function MarcoTelefono({
  titulo,
  atras,
  quien,
  onSalir,
  pestana,
  children,
}: {
  titulo: string;
  atras?: string;
  quien?: string;
  onSalir?: () => void;
  pestana?: "ruta" | "historial" | null;
  children: ReactNode;
}) {
  return (
    <div className="phone">
      <a href="#contenido" className="sr-only">Saltar al contenido</a>
      <header className="app-h">
        {atras ? (
          <Link className="back" to={atras} aria-label="Regresar">‹</Link>
        ) : null}
        <h1>{titulo}</h1>
        <div className="quien">
          <span>{quien}</span>
          {onSalir ? (
            <button type="button" className="salir" onClick={onSalir}>Salir</button>
          ) : null}
        </div>
      </header>
      <div className="scroll" id="contenido">{children}<Pie /></div>
      {pestana ? (
        <nav className="tabs" aria-label="Principal">
          <Link to="/repartidor" aria-current={pestana === "ruta" ? "page" : undefined}>
            <span className="i" aria-hidden="true">🗺️</span>
            Mi ruta
          </Link>
          <Link to="/repartidor/historial" aria-current={pestana === "historial" ? "page" : undefined}>
            <span className="i" aria-hidden="true">🧾</span>
            Historial
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
