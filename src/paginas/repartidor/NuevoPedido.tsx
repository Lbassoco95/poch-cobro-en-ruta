import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { pesos } from "../../lib/formato";

type Producto = {
  id: string;
  sku: string;
  nombre: string;
  precio: number;
  disponible: number;
};

export default function NuevoPedido() {
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const operacion = useRef(crypto.randomUUID());
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [alias, setAlias] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    llamar<{ productos: Producto[] }>("catalogo", sesion.token)
      .then((data) => setProductos(data.productos))
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar el catálogo."));
  }, [sesion]);

  const lineas = productos
    .map((producto) => ({ producto_id: producto.id, cantidad: cantidades[producto.id] ?? 0, precio: Number(producto.precio) }))
    .filter((linea) => linea.cantidad > 0);
  const total = lineas.reduce((suma, linea) => suma + linea.precio * linea.cantidad, 0);

  function cambiar(id: string, delta: number, disponible: number) {
    setCantidades((actual) => {
      const siguiente = Math.min(disponible, Math.max(0, (actual[id] ?? 0) + delta));
      return { ...actual, [id]: siguiente };
    });
  }

  async function generar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<{ pedido_id: string }>("crear-pedido", sesion.token, {
        operacion_id: operacion.current,
        cliente_alias: alias.trim(),
        lineas: lineas.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
        vigencia_min: 15,
      });
      navegar(`/repartidor/cobrar/${data.pedido_id}`);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo crear el pedido.");
      setOcupado(false);
    }
  }

  return (
    <Marco titulo="Nuevo pedido" enlaces={[{ a: "/repartidor", texto: "Pedidos" }]}>
      <label className="block text-sm font-medium" htmlFor="alias">
        Alias del cliente
        <input
          id="alias"
          value={alias}
          maxLength={60}
          onChange={(evento) => setAlias(evento.target.value)}
          className="mt-1 min-h-14 w-full rounded-2xl border border-linea bg-white px-4 text-lg"
        />
      </label>
      <ul className="mt-4 space-y-3">
        {productos.map((producto) => (
          <li key={producto.id} className="rounded-2xl border border-linea bg-white p-4">
            <p className="text-lg font-semibold">{producto.nombre}</p>
            <p className="text-sm text-marino/70">
              {pesos(producto.precio)} · disponible {producto.disponible}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" aria-label={`Quitar ${producto.nombre}`} className="min-h-12 min-w-12 rounded-full border border-linea text-2xl" onClick={() => cambiar(producto.id, -1, producto.disponible)}>
                −
              </button>
              <span className="min-w-8 text-center text-2xl font-semibold" aria-live="polite">
                {cantidades[producto.id] ?? 0}
              </span>
              <button type="button" aria-label={`Agregar ${producto.nombre}`} className="min-h-12 min-w-12 rounded-full border border-linea text-2xl" onClick={() => cambiar(producto.id, 1, producto.disponible)} disabled={producto.disponible <= (cantidades[producto.id] ?? 0)}>
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-2xl font-semibold">Total {pesos(total)}</p>
      <div className="mt-4 space-y-3">
        <Aviso texto={error} />
        <Boton onClick={() => void generar()} ocupado={ocupado || !alias.trim() || lineas.length === 0}>
          Generar cobro
        </Boton>
      </div>
    </Marco>
  );
}
