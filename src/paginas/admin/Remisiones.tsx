import { useEffect, useRef, useState } from "react";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos } from "../../lib/formato";

type Catalogo = { productos: Array<{ id: string; nombre: string; sku: string; precio: number }> };
type Tablero = {
  rutas: Array<{
    id: string;
    nombre: string;
    estado: string;
    repartidor: string;
    paradas: Array<{ id: string; parada: number; cliente: string; zona: string | null; estado: string; total: number; folio_documento: string | null; orden_compra: string | null }>;
  }>;
  repartidores: Array<{ repartidor_id: string; nombre: string }>;
};

type OcPendiente = {
  id: string;
  folio: string;
  cliente: string;
  zona: string;
  lineas: Array<{ producto_id: string; cantidad: number; nombre: string }>;
};

const OC_DEMO: OcPendiente[] = [
  {
    id: "oc-demo-1",
    folio: "OC-1001",
    cliente: "Taller Norte",
    zona: "Industrial",
    lineas: [],
  },
];

export default function Remisiones() {
  const { sesion } = useSesion();
  const opRuta = useRef(crypto.randomUUID());
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo["productos"]>([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [repartidorId, setRepartidorId] = useState("");
  const [nombreRuta, setNombreRuta] = useState("Ruta del día");
  const [rutaId, setRutaId] = useState("");
  const [folio, setFolio] = useState("");
  const [cliente, setCliente] = useState("");
  const [zona, setZona] = useState("");
  const [ordenCompra, setOrdenCompra] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [lineas, setLineas] = useState<Array<{ producto_id: string; cantidad: number; nombre: string }>>([]);

  function cargar() {
    if (!sesion) return;
    Promise.all([
      llamar<Tablero>("tablero", sesion.token),
      llamar<Catalogo>("catalogo", sesion.token),
    ])
      .then(([t, c]) => {
        setTablero(t);
        setCatalogo(c.productos ?? []);
        if (!rutaId && t.rutas[0]) setRutaId(t.rutas[0].id);
        if (!repartidorId && t.repartidores[0]) setRepartidorId(t.repartidores[0].repartidor_id);
        if (!productoId && c.productos?.[0]) setProductoId(c.productos[0].id);
      })
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar."));
  }

  useEffect(() => {
    cargar();
  }, [sesion]);

  async function crearRuta() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
      const data = await llamar<{ ruta_id: string }>("crear-ruta", sesion.token, {
        operacion_id: opRuta.current,
        repartidor_id: repartidorId,
        nombre: nombreRuta,
        fecha,
      });
      opRuta.current = crypto.randomUUID();
      setRutaId(data.ruta_id);
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo crear la ruta.");
    } finally {
      setOcupado(false);
    }
  }

  function agregarLinea() {
    const prod = catalogo.find((p) => p.id === productoId);
    if (!prod || cantidad < 1) return;
    setLineas((prev) => [...prev, { producto_id: prod.id, cantidad, nombre: prod.nombre }]);
  }

  async function crearRemision(oc?: OcPendiente) {
    if (!sesion || !rutaId) return;
    setOcupado(true);
    setError("");
    try {
      const lineasFinal = oc
        ? (oc.lineas.length ? oc.lineas : lineas)
        : lineas;
      if (!lineasFinal.length) throw new ErrorDeApi("Agregue al menos una pieza.");
      await llamar("cargar-documento", sesion.token, {
        operacion_id: crypto.randomUUID(),
        ruta_id: rutaId,
        tipo: "remision",
        folio: oc ? `REM-${oc.folio}` : folio,
        cliente: oc?.cliente ?? cliente,
        zona: oc?.zona ?? zona,
        orden_compra: oc?.folio ?? ordenCompra,
        lineas: lineasFinal.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
      });
      setFolio("");
      setCliente("");
      setZona("");
      setOrdenCompra("");
      setLineas([]);
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo crear la remisión.");
    } finally {
      setOcupado(false);
    }
  }

  async function cerrar(ruta: string) {
    if (!sesion) return;
    setOcupado(true);
    try {
      await llamar("cerrar-ruta", sesion.token, { operacion_id: crypto.randomUUID(), ruta_id: ruta });
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cerrar la ruta.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Marco titulo="Remisiones y rutas" ancho="max-w-5xl" enlaces={[{ a: "/admin", texto: "Tablero" }, { a: "/admin/pagos", texto: "Pagos" }]}>
      <Aviso texto={error} />
      <section className="rounded-2xl border border-linea bg-white p-4">
        <h2 className="text-lg font-semibold">Crear ruta</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Repartidor
            <select value={repartidorId} onChange={(e) => setRepartidorId(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3">
              {(tablero?.repartidores ?? []).map((r) => <option key={r.repartidor_id} value={r.repartidor_id}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm">Nombre
            <input value={nombreRuta} onChange={(e) => setNombreRuta(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3" />
          </label>
          <div className="flex items-end"><Boton onClick={() => void crearRuta()} ocupado={ocupado}>Crear ruta</Boton></div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-linea bg-white p-4">
        <h2 className="text-lg font-semibold">Órdenes de compra por asignar</h2>
        <p className="text-sm text-marino/70">Demostración: use «Crear remisión y asignar» sobre una ruta abierta.</p>
        <ul className="mt-3 space-y-3">
          {OC_DEMO.map((oc) => (
            <li key={oc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linea px-3 py-3">
              <div>
                <p className="font-medium">{oc.folio} · {oc.cliente}</p>
                <p className="text-sm text-marino/70">{oc.zona}</p>
              </div>
              <button type="button" disabled={ocupado || !rutaId} onClick={() => {
                if (!lineas.length && catalogo[0]) {
                  setLineas([{ producto_id: catalogo[0].id, cantidad: 1, nombre: catalogo[0].nombre }]);
                }
                void crearRemision({ ...oc, lineas: lineas.length ? lineas : (catalogo[0] ? [{ producto_id: catalogo[0].id, cantidad: 1, nombre: catalogo[0].nombre }] : []) });
              }} className="min-h-12 rounded-2xl bg-jade px-4 font-semibold text-white disabled:opacity-50">
                Crear remisión y asignar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-linea bg-white p-4">
        <h2 className="text-lg font-semibold">Cargar documento a la ruta</h2>
        <label className="mt-2 block text-sm">Ruta
          <select value={rutaId} onChange={(e) => setRutaId(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3">
            {(tablero?.rutas ?? []).filter((r) => r.estado === "abierta").map((r) => (
              <option key={r.id} value={r.id}>{r.nombre} · {r.repartidor}</option>
            ))}
          </select>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Folio remisión<input value={folio} onChange={(e) => setFolio(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3" /></label>
          <label className="text-sm">Orden de compra<input value={ordenCompra} onChange={(e) => setOrdenCompra(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3" /></label>
          <label className="text-sm">Cliente<input value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3" /></label>
          <label className="text-sm">Zona<input value={zona} onChange={(e) => setZona(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3" /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className="min-h-12 flex-1 rounded-xl border border-linea px-3">
            <option value="">Pieza</option>
            {catalogo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="min-h-12 w-24 rounded-xl border border-linea px-3" />
          <button type="button" onClick={agregarLinea} className="min-h-12 rounded-xl border border-linea px-4">Agregar</button>
        </div>
        <ul className="mt-2 text-sm">{lineas.map((l, i) => <li key={i}>{l.cantidad} × {l.nombre}</li>)}</ul>
        <div className="mt-3 max-w-sm"><Boton onClick={() => void crearRemision()} ocupado={ocupado}>Cargar como última parada</Boton></div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Rutas del día</h2>
        {(tablero?.rutas ?? []).map((ruta) => (
          <article key={ruta.id} className="mt-3 rounded-2xl border border-linea bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{ruta.nombre} · {ruta.repartidor}</p>
                <p className="text-sm">{etiqueta(ruta.estado)}</p>
              </div>
              {ruta.estado === "abierta" && (
                <button type="button" onClick={() => void cerrar(ruta.id)} className="min-h-12 rounded-2xl border border-linea px-4 font-medium">Cerrar ruta</button>
              )}
            </div>
            <ol className="mt-3 space-y-2">
              {ruta.paradas.map((p) => (
                <li key={p.id} className="text-sm">
                  #{p.parada} {p.cliente} · {p.zona ?? "Sin zona"} · {p.folio_documento}
                  {p.orden_compra ? ` · OC ${p.orden_compra}` : ""} · {etiqueta(p.estado)} · {pesos(p.total)}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>
    </Marco>
  );
}
