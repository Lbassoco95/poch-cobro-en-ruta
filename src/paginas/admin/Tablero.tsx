import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos } from "../../lib/formato";

type Repartidor = { repartidor_id: string; nombre: string; pedidos: number; cobrado: number; stock_disponible: number };
type Pedido = {
  id: string;
  folio: number;
  cliente_alias: string;
  total: number;
  estado: string;
  repartidor: string;
  cobro: { estado: string; importe: number } | null;
};
type Indicadores = { cobrado: number; pendiente: number; vencido: number; por_resolver: number; recuperados: number };
type Respuesta = { indicadores: Indicadores; repartidores: Repartidor[]; pedidos: Pedido[] };
type Prueba = { prueba: string; ok: boolean; detalle: string };

export default function Tablero() {
  const { sesion } = useSesion();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [estado, setEstado] = useState("");
  const [repartidor, setRepartidor] = useState("");
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<Respuesta>("tablero", sesion.token, {
        estado: estado || undefined,
        repartidor_id: repartidor || undefined,
      })
        .then((data) => {
          if (activo) setDatos(data);
        })
        .catch((fallo: unknown) => {
          if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar el tablero.");
        });
    };
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, [sesion, estado, repartidor]);

  useEffect(() => {
    if (!sesion) return;
    let detenido = false;
    const conciliar = () => {
      if (detenido) return;
      llamar<{ recuperadas: number }>("conciliar-con-pey", sesion.token)
        .then((data) => setNota(`Conciliación automática. Recuperados en esta pasada: ${data.recuperadas}.`))
        .catch((fallo: unknown) => {
          const mensaje = fallo instanceof ErrorDeApi ? fallo.message : "";
          if (mensaje.includes("no está configurado")) {
            detenido = true;
            setNota("La conciliación con pey no está configurada. Falta PEY_API_KEY.");
          }
        });
    };
    const reloj = setInterval(conciliar, 60_000);
    return () => {
      detenido = true;
      clearInterval(reloj);
    };
  }, [sesion]);

  async function conciliarAhora() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<{ revisadas: number; recuperadas: number }>("conciliar-con-pey", sesion.token);
      setNota(`Se revisaron ${data.revisadas} pagos. Recuperados en esta pasada: ${data.recuperadas}.`);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo conciliar.");
    } finally {
      setOcupado(false);
    }
  }

  async function verificar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<{ pruebas: Prueba[] }>("verificar-integridad", sesion.token);
      setPruebas(data.pruebas);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo verificar.");
    } finally {
      setOcupado(false);
    }
  }

  const indicadores = datos?.indicadores;

  return (
    <Marco
      titulo="Tablero"
      ancho="max-w-6xl"
      enlaces={[{ a: "/admin/pagos", texto: "Pagos por resolver" }]}
    >
      <section className="grid gap-3 sm:grid-cols-5" aria-label="Indicadores del día">
        <Tarjeta nombre="Cobrado hoy" valor={pesos(indicadores?.cobrado ?? 0)} />
        <Tarjeta nombre="Pendiente" valor={pesos(indicadores?.pendiente ?? 0)} />
        <Tarjeta nombre="Vencidos hoy" valor={String(indicadores?.vencido ?? 0)} />
        <Tarjeta nombre="Por resolver" valor={String(indicadores?.por_resolver ?? 0)} />
        <Tarjeta nombre="Recuperados por conciliación" valor={String(indicadores?.recuperados ?? 0)} />
      </section>
      <h2 className="mt-8 text-xl font-semibold">Por repartidor</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-marino/70">
              <th className="py-2 font-medium">Repartidor</th>
              <th className="py-2 font-medium">Pedidos hoy</th>
              <th className="py-2 font-medium">Cobrado</th>
              <th className="py-2 font-medium">Piezas disponibles</th>
            </tr>
          </thead>
          <tbody>
            {(datos?.repartidores ?? []).map((fila) => (
              <tr key={fila.repartidor_id} className="border-t border-linea">
                <th scope="row" className="py-3 font-medium">{fila.nombre}</th>
                <td>{fila.pedidos}</td>
                <td>{pesos(fila.cobrado)}</td>
                <td>{fila.stock_disponible}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <label className="text-sm font-medium" htmlFor="filtro-estado">
          Estado
          <select id="filtro-estado" value={estado} onChange={(evento) => setEstado(evento.target.value)} className="mt-1 block min-h-12 rounded-xl border border-linea bg-white px-3">
            <option value="">Todos</option>
            <option value="por_cobrar">Por cobrar</option>
            <option value="pagado">Pagado</option>
            <option value="entregado">Entregado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="filtro-repartidor">
          Repartidor
          <select id="filtro-repartidor" value={repartidor} onChange={(evento) => setRepartidor(evento.target.value)} className="mt-1 block min-h-12 rounded-xl border border-linea bg-white px-3">
            <option value="">Todos</option>
            {(datos?.repartidores ?? []).map((fila) => (
              <option key={fila.repartidor_id} value={fila.repartidor_id}>{fila.nombre}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Pedidos y cobros. La tabla se actualiza sola.</caption>
          <thead>
            <tr className="text-marino/70">
              <th className="py-2 font-medium">Folio</th>
              <th className="py-2 font-medium">Cliente</th>
              <th className="py-2 font-medium">Repartidor</th>
              <th className="py-2 font-medium">Total</th>
              <th className="py-2 font-medium">Pedido</th>
              <th className="py-2 font-medium">Cobro</th>
            </tr>
          </thead>
          <tbody>
            {(datos?.pedidos ?? []).map((pedido) => (
              <tr key={pedido.id} className="border-t border-linea">
                <td className="py-3">
                  <Link className="font-semibold text-jade" to={`/admin/pedido/${pedido.id}`}>{pedido.folio}</Link>
                </td>
                <td>{pedido.cliente_alias}</td>
                <td>{pedido.repartidor}</td>
                <td>{pesos(pedido.total)}</td>
                <td>{etiqueta(pedido.estado)}</td>
                <td>{etiqueta(pedido.cobro?.estado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Boton onClick={() => void conciliarAhora()} ocupado={ocupado}>Conciliar con pey</Boton>
        <Boton secundario onClick={() => void verificar()} ocupado={ocupado}>Verificar integridad</Boton>
      </div>
      {nota && <p className="mt-3" role="status">{nota}</p>}
      <div className="mt-3"><Aviso texto={error} /></div>
      {pruebas.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Resultado de integridad">
          {pruebas.map((prueba) => (
            <li key={prueba.prueba} className={`rounded-2xl px-4 py-3 ${prueba.ok ? "bg-white text-jade" : "bg-ambar-fondo text-ambar"}`}>
              <span className="font-semibold">{prueba.ok ? "En orden" : "Con diferencia"}. </span>
              {prueba.prueba}. {prueba.detalle}
            </li>
          ))}
        </ul>
      )}
    </Marco>
  );
}

function Tarjeta({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <article className="rounded-2xl border border-linea bg-white p-4">
      <h2 className="text-sm font-medium text-marino/70">{nombre}</h2>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
    </article>
  );
}
