import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, fechaHora, pesos } from "../../lib/formato";

type Indicadores = { cobrado: number; pendiente: number; vencido: number; por_resolver: number; recuperados: number; devuelto: number };
type Pedido = {
  id: string;
  folio: number;
  cliente_alias: string;
  total: number;
  estado: string;
  repartidor: string;
  cobro: { estado: string; importe: number } | null;
};
type Entrega = {
  pedido_id: string;
  folio: number | null;
  cliente: string | null;
  repartidor: string | null;
  total: number | null;
  recibe_nombre: string;
};
type Reorden = { id: number; ocurrio_en: string; repartidor: string; detalle: { motivo?: string; antes?: string[]; despues?: string[] } };
type Respuesta = {
  indicadores: Indicadores;
  repartidores: Array<{ repartidor_id: string; nombre: string }>;
  pedidos: Pedido[];
  entregas_por_revisar: Entrega[];
  reordenamientos: Reorden[];
};
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
  const [vista, setVista] = useState<{ pedidoId: string; tipo: "foto" | "firma"; url: string } | null>(null);

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
        .then((data) => setNota(`Conciliación automática. Recuperados: ${data.recuperadas}.`))
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

  async function verificar() {
    if (!sesion) return;
    setOcupado(true);
    try {
      const data = await llamar<{ pruebas: Prueba[] }>("verificar-integridad", sesion.token);
      setPruebas(data.pruebas);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo verificar.");
    } finally {
      setOcupado(false);
    }
  }

  async function verEvidencia(pedidoId: string, tipo: "foto" | "firma") {
    if (!sesion) return;
    try {
      const data = await llamar<{ url: string }>("evidencia-url", sesion.token, { pedido_id: pedidoId, tipo });
      setVista({ pedidoId, tipo, url: data.url });
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir la evidencia.");
    }
  }

  async function marcarRevisada(pedidoId: string) {
    if (!sesion) return;
    const texto = prompt("Nota de revisión (mínimo 5 caracteres)");
    if (!texto || texto.trim().length < 5) return;
    setOcupado(true);
    try {
      await llamar("revisar-entrega", sesion.token, {
        operacion_id: crypto.randomUUID(),
        pedido_id: pedidoId,
        nota: texto.trim(),
      });
      setDatos((actual) => actual
        ? { ...actual, entregas_por_revisar: actual.entregas_por_revisar.filter((e) => e.pedido_id !== pedidoId) }
        : actual);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo marcar la revisión.");
    } finally {
      setOcupado(false);
    }
  }

  const indicadores = datos?.indicadores;

  return (
    <Marco
      titulo="Tablero"
      ancho="max-w-6xl"
      enlaces={[
        { a: "/admin/remisiones", texto: "Remisiones y rutas" },
        { a: "/admin/pagos", texto: "Pagos por resolver" },
      ]}
    >
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Indicadores del día">
        <Tarjeta nombre="Cobrado hoy" valor={pesos(indicadores?.cobrado ?? 0)} />
        <Tarjeta nombre="Pendiente" valor={pesos(indicadores?.pendiente ?? 0)} />
        <Tarjeta nombre="Devuelto" valor={pesos(indicadores?.devuelto ?? 0)} />
        <Tarjeta nombre="Vencidos hoy" valor={String(indicadores?.vencido ?? 0)} />
        <Tarjeta nombre="Por resolver" valor={String(indicadores?.por_resolver ?? 0)} />
        <Tarjeta nombre="Recuperados" valor={String(indicadores?.recuperados ?? 0)} />
      </section>

      <h2 className="mt-8 text-xl font-semibold">Entregas por revisar</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-marino/70">
              <th className="py-2 font-medium">Folio</th>
              <th className="py-2 font-medium">Cliente</th>
              <th className="py-2 font-medium">Repartidor</th>
              <th className="py-2 font-medium">Entrega</th>
              <th className="py-2 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {(datos?.entregas_por_revisar ?? []).map((entrega) => (
              <tr key={entrega.pedido_id} className="border-t border-linea">
                <td className="py-3">{entrega.folio}</td>
                <td>{entrega.cliente}</td>
                <td>{entrega.repartidor}</td>
                <td>
                  Foto y firma{" "}
                  <button type="button" className="font-medium text-jade" onClick={() => void verEvidencia(entrega.pedido_id, "foto")}>Ver</button>
                  {" · "}
                  <button type="button" className="font-medium text-jade" onClick={() => void verEvidencia(entrega.pedido_id, "firma")}>Firma</button>
                </td>
                <td>
                  <button type="button" className="rounded-xl border border-linea px-3 py-2" onClick={() => void marcarRevisada(entrega.pedido_id)} disabled={ocupado}>
                    Marcar revisada
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Reordenamientos recientes</h2>
      <ul className="mt-2 space-y-2">
        {(datos?.reordenamientos ?? []).map((fila) => (
          <li key={fila.id} className="rounded-2xl border border-linea bg-white p-3 text-sm">
            {fechaHora(fila.ocurrio_en)} · {fila.repartidor} · {fila.detalle?.motivo ?? "Sin motivo"}
          </li>
        ))}
        {(datos?.reordenamientos ?? []).length === 0 && <li className="text-sm text-marino/70">Sin reordenamientos hoy.</li>}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <label className="text-sm font-medium" htmlFor="filtro-estado">
          Estado
          <select id="filtro-estado" value={estado} onChange={(evento) => setEstado(evento.target.value)} className="mt-1 block min-h-12 rounded-xl border border-linea bg-white px-3">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="por_cobrar">Por cobrar</option>
            <option value="pagado">Pagado</option>
            <option value="entregado">Entregado</option>
            <option value="devuelto">Devuelto</option>
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
          <thead>
            <tr className="text-marino/70">
              <th className="py-2 font-medium">Folio</th>
              <th className="py-2 font-medium">Cliente</th>
              <th className="py-2 font-medium">Repartidor</th>
              <th className="py-2 font-medium">Total</th>
              <th className="py-2 font-medium">Estado</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Boton onClick={() => void verificar()} ocupado={ocupado}>Verificar integridad</Boton>
        <Boton
          secundario
          onClick={() => {
            void llamar<{ recuperadas: number }>("conciliar-con-pey", sesion!.token)
              .then((d) => setNota(`Recuperados: ${d.recuperadas}`))
              .catch((f: unknown) => setError(f instanceof ErrorDeApi ? f.message : "Error"));
          }}
          ocupado={ocupado}
        >
          Conciliar con pey
        </Boton>
      </div>
      {nota && <p className="mt-3" role="status">{nota}</p>}
      <div className="mt-3"><Aviso texto={error} /></div>
      {pruebas.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Cinco verificaciones de integridad">
          {pruebas.map((prueba) => (
            <li key={prueba.prueba} className={`rounded-2xl px-4 py-3 ${prueba.ok ? "bg-white text-jade" : "bg-ambar-fondo text-ambar"}`}>
              <span className="font-semibold">{prueba.ok ? "En orden" : "Con diferencia"}. </span>
              {prueba.prueba}. {prueba.detalle}
            </li>
          ))}
        </ul>
      )}
      {vista && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-marino/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] max-w-lg overflow-auto rounded-2xl bg-white p-4">
            <p className="font-semibold">{vista.tipo === "foto" ? "Foto" : "Firma"} (URL 60 s)</p>
            <img src={vista.url} alt={vista.tipo} className="mt-3 w-full" />
            <button type="button" className="mt-3 min-h-12 w-full rounded-2xl border border-linea" onClick={() => setVista(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </Marco>
  );
}

function Tarjeta({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <article className="rounded-2xl border border-linea bg-white p-4">
      <h2 className="text-sm font-medium text-marino/70">{nombre}</h2>
      <p className="mt-1 text-xl font-semibold">{valor}</p>
    </article>
  );
}
