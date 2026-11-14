import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos } from "../../lib/formato";

type Pedido = {
  id: string;
  folio: number;
  cliente_alias: string;
  total: number;
  estado: string;
  cobro: { id: string; estado: string } | null;
};

export default function Pedidos() {
  const { sesion } = useSesion();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<{ pedidos: Pedido[] }>("mis-pedidos", sesion.token)
        .then((data) => {
          if (activo) setPedidos(data.pedidos);
        })
        .catch((fallo: unknown) => {
          if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudieron cargar los pedidos.");
        });
    };
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, [sesion]);

  return (
    <Marco titulo="Pedidos de hoy" enlaces={[{ a: "/repartidor/camioneta", texto: "Mi camioneta" }]}>
      <Link to="/repartidor/nuevo" className="mb-4 block">
        <Boton>Nuevo pedido</Boton>
      </Link>
      <Aviso texto={error} />
      {pedidos.length === 0 && <p className="mt-4 text-lg">Todavía no hay pedidos hoy.</p>}
      <ul className="mt-4 space-y-3">
        {pedidos.map((pedido) => {
          const destino = pedido.estado === "pagado" || pedido.estado === "entregado"
            ? `/repartidor/pagado/${pedido.id}`
            : `/repartidor/cobrar/${pedido.id}`;
          return (
            <li key={pedido.id}>
              <Link to={destino} className="block rounded-2xl border border-linea bg-white p-4">
                <span className="text-sm text-marino/70">Folio {pedido.folio}</span>
                <span className="mt-1 block text-xl font-semibold">{pedido.cliente_alias}</span>
                <span className="mt-1 flex items-center justify-between text-lg">
                  <span>{pesos(pedido.total)}</span>
                  <span className="rounded-full bg-papel px-3 py-1 text-sm font-medium">{etiqueta(pedido.estado)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Marco>
  );
}
