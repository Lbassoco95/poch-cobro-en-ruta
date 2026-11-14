import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos } from "../../lib/formato";

type Parada = {
  id: string;
  cliente_alias: string;
  zona: string | null;
  total: number;
  estado: string;
  parada: number;
  tipo_documento: string | null;
  folio_documento: string | null;
  orden_compra_ref: string | null;
  piezas: Array<{ nombre: string; cantidad: number }>;
};

type Respuesta = {
  ruta: { id: string; nombre: string } | null;
  paradas: Parada[];
  resumen: { entregadas: number; cobrado: number; por_cobrar: number };
  siguiente_parada: string | null;
};

export default function MiRuta() {
  const { sesion } = useSesion();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("");
  const [orden, setOrden] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  function cargar() {
    if (!sesion) return;
    llamar<Respuesta>("mi-ruta", sesion.token)
      .then((data) => {
        setDatos(data);
        setOrden(data.paradas.filter((p) => p.estado === "pendiente" || p.estado === "por_cobrar").map((p) => p.id));
        if (data.siguiente_parada) {
          requestAnimationFrame(() => {
            document.getElementById(`parada-${data.siguiente_parada}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
          });
        }
      })
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar la ruta."));
  }

  useEffect(() => {
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => clearInterval(reloj);
  }, [sesion]);

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= orden.length) return;
    const copia = [...orden];
    const [item] = copia.splice(indice, 1);
    copia.splice(destino, 0, item);
    setOrden(copia);
  }

  async function guardarOrden() {
    if (!sesion || !datos?.ruta) return;
    setOcupado(true);
    setError("");
    try {
      await llamar("reordenar-paradas", sesion.token, {
        operacion_id: crypto.randomUUID(),
        ruta_id: datos.ruta.id,
        orden,
        motivo,
      });
      setMotivo("");
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo guardar el orden.");
    } finally {
      setOcupado(false);
    }
  }

  function accion(parada: Parada): { a: string; texto: string } | null {
    if (parada.estado === "pendiente" || parada.estado === "por_cobrar") {
      return { a: `/repartidor/parada/${parada.id}`, texto: "Cobrar" };
    }
    if (parada.estado === "pagado") return { a: `/repartidor/entrega/${parada.id}`, texto: "Entregar" };
    if (parada.estado === "entregado") return { a: `/repartidor/parada/${parada.id}`, texto: "Ver" };
    return null;
  }

  const movibles = orden.map((id) => datos?.paradas.find((p) => p.id === id)).filter(Boolean) as Parada[];

  return (
    <Marco titulo="Mi ruta" enlaces={[{ a: "/repartidor/historial", texto: "Historial" }]}>
      <Aviso texto={error} />
      {!datos?.ruta && <p className="mt-4 text-lg">No hay una ruta abierta para hoy.</p>}
      {datos?.ruta && (
        <>
          <p className="text-marino/70">{datos.ruta.nombre}</p>
          <section className="mt-4 grid grid-cols-3 gap-2" aria-label="Resumen de la ruta">
            <Resumen etiqueta="Entregadas" valor={String(datos.resumen.entregadas)} />
            <Resumen etiqueta="Cobrado" valor={pesos(datos.resumen.cobrado)} />
            <Resumen etiqueta="Por cobrar" valor={pesos(datos.resumen.por_cobrar)} />
          </section>
          <ol className="mt-6 space-y-4">
            {datos.paradas.map((parada) => {
              const boton = accion(parada);
              return (
                <li
                  key={parada.id}
                  id={`parada-${parada.id}`}
                  className={`rounded-2xl border px-4 py-4 ${parada.id === datos.siguiente_parada ? "border-jade bg-white shadow-sm" : "border-linea bg-white/70"}`}
                >
                  <p className="text-sm text-marino/70">Parada {parada.parada} · {etiqueta(parada.estado)}</p>
                  <h2 className="text-xl font-semibold">{parada.cliente_alias}</h2>
                  <p className="text-sm">{parada.zona ?? "Sin zona"}</p>
                  <p className="mt-1 text-sm">
                    {etiqueta(parada.tipo_documento)} {parada.folio_documento}
                    {parada.orden_compra_ref ? ` · OC ${parada.orden_compra_ref}` : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    {parada.piezas.map((p) => `${p.cantidad}× ${p.nombre}`).join(", ")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{pesos(parada.total)}</p>
                  {boton && (
                    <Link to={boton.a} className="mt-3 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-jade text-lg font-semibold text-white">
                      {boton.texto}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
          {movibles.length > 1 && (
            <section className="mt-8 rounded-2xl border border-linea bg-white p-4">
              <h2 className="text-lg font-semibold">Reordenar paradas</h2>
              <p className="text-sm text-marino/70">Solo pendientes y por cobrar. Escriba el motivo.</p>
              <ul className="mt-3 space-y-2">
                {movibles.map((parada, indice) => (
                  <li key={parada.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{parada.cliente_alias}</span>
                    <button type="button" className="rounded-xl border border-linea px-3 py-2" onClick={() => mover(indice, -1)} aria-label="Subir">↑</button>
                    <button type="button" className="rounded-xl border border-linea px-3 py-2" onClick={() => mover(indice, 1)} aria-label="Bajar">↓</button>
                  </li>
                ))}
              </ul>
              <label className="mt-3 block text-sm font-medium" htmlFor="motivo-reorden">
                Motivo
                <textarea id="motivo-reorden" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 min-h-20 w-full rounded-2xl border border-linea px-3 py-2" />
              </label>
              <div className="mt-3">
                <Boton onClick={() => void guardarOrden()} ocupado={ocupado}>Guardar orden</Boton>
              </div>
            </section>
          )}
        </>
      )}
    </Marco>
  );
}

function Resumen({ etiqueta: nombre, valor }: { etiqueta: string; valor: string }) {
  return (
    <article className="rounded-2xl border border-linea bg-white p-3 text-center">
      <p className="text-xs text-marino/70">{nombre}</p>
      <p className="mt-1 text-lg font-semibold">{valor}</p>
    </article>
  );
}
