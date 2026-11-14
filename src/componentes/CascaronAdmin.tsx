import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSesion } from "../contexto/Sesion";
import { llamar } from "../lib/api";
import { leerAvisosVistos } from "../lib/reorden";
import type { Tablero } from "../lib/tipos";
import { Pie } from "./Pie";

const ENLACES = [
  ["tablero", "/admin", "Tablero"],
  ["rutas", "/admin/rutas", "Rutas"],
  ["pagos", "/admin/pagos", "Pagos por resolver"],
  ["bitacora", "/admin/bitacora", "Bitácora"],
  ["estilo", "/admin/estilo", "Guía de estilo"],
] as const;

export function CascaronAdmin({
  actual,
  children,
}: {
  actual: (typeof ENLACES)[number][0];
  children: ReactNode;
}) {
  const { sesion, salir } = useSesion();
  const navegar = useNavigate();
  const [avisos, setAvisos] = useState(0);
  const [pagos, setPagos] = useState(0);

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<Tablero>("tablero", sesion.token)
        .then((datos) => {
          if (!activo) return;
          const vistos = leerAvisosVistos();
          setAvisos((datos.reordenamientos ?? []).filter((fila) => !vistos.has(String(fila.id))).length);
          setPagos((datos.discrepancias ?? []).filter((pago) => !pago.resolucion).length);
        })
        .catch(() => {
          if (activo) {
            setAvisos(0);
            setPagos(0);
          }
        });
    };
    cargar();
    const reloj = setInterval(cargar, 8000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, [sesion]);

  function cuenta(clave: (typeof ENLACES)[number][0]): number {
    if (clave === "tablero") return avisos;
    if (clave === "pagos") return pagos;
    return 0;
  }

  return (
    <div className="stage">
      <div className="admin">
        <aside className="side">
          <div className="rotulo">ADMINISTRACIÓN</div>
          {ENLACES.map(([clave, href, texto]) => {
            const n = cuenta(clave);
            return (
              <Link key={clave} to={href} aria-current={actual === clave ? "page" : undefined}>
                <span>{texto}</span>
                {n > 0 ? <span className="n">{n}</span> : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              void salir().then(() => navegar("/"));
            }}
          >
            Salir
          </button>
        </aside>
        <main className="panel" id="contenido">
          {children}
          <Pie />
        </main>
      </div>
    </div>
  );
}
