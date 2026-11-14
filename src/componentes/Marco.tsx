import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSesion } from "../contexto/Sesion";
import { Pie } from "./Pie";

export function Marco({
  titulo,
  enlaces,
  children,
  ancho = "max-w-lg",
}: {
  titulo: string;
  enlaces: Array<{ a: string; texto: string }>;
  children: ReactNode;
  ancho?: string;
}) {
  const { sesion, salir } = useSesion();
  return (
    <div className={`mx-auto flex min-h-screen flex-col px-4 py-5 ${ancho}`}>
      <a href="#contenido" className="sr-only focus:not-sr-only">
        Saltar al contenido
      </a>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-jade">Poch</p>
          <h1 className="text-2xl font-semibold text-marino">{titulo}</h1>
          <p className="text-sm text-marino/70">{sesion?.nombre}</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Secciones">
          {enlaces.map((enlace) => (
            <Link
              key={enlace.a}
              to={enlace.a}
              className="rounded-full border border-linea bg-white px-4 py-2 text-sm font-medium text-marino"
            >
              {enlace.texto}
            </Link>
          ))}
          <button type="button" onClick={() => void salir()} className="rounded-full px-4 py-2 text-sm font-medium text-marino">
            Salir
          </button>
        </nav>
      </header>
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <Pie />
    </div>
  );
}

export function Aviso({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <p role="alert" className="rounded-2xl bg-ambar-fondo px-4 py-3 text-ambar">
      {texto}
    </p>
  );
}

export function Boton({
  children,
  onClick,
  tipo = "button",
  ocupado = false,
  secundario = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  tipo?: "button" | "submit";
  ocupado?: boolean;
  secundario?: boolean;
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={ocupado}
      aria-busy={ocupado}
      className={`min-h-14 w-full rounded-2xl px-4 text-lg font-semibold disabled:opacity-60 ${
        secundario ? "border border-linea bg-white text-marino" : "bg-jade text-white"
      }`}
    >
      {ocupado ? "Espere…" : children}
    </button>
  );
}
