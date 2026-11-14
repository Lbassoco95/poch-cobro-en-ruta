import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../contexto/Sesion";
import { MarcoTelefono } from "./MarcoTelefono";

export function CascaronRepartidor({
  titulo,
  atras,
  pestana,
  children,
}: {
  titulo: string;
  atras?: string;
  pestana?: "ruta" | "historial" | null;
  children: ReactNode;
}) {
  const { sesion, salir } = useSesion();
  const navegar = useNavigate();
  return (
    <div className="stage">
      <MarcoTelefono
        titulo={titulo}
        atras={atras}
        quien={sesion?.nombre}
        pestana={pestana}
        onSalir={() => {
          void salir().then(() => navegar("/"));
        }}
      >
        {children}
      </MarcoTelefono>
    </div>
  );
}
