import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { AvisosReorden } from "../../componentes/AvisosReorden";
import { Boton } from "../../componentes/Boton";
import { CascaronAdmin } from "../../componentes/CascaronAdmin";
import { Insignia } from "../../componentes/Insignia";
import { Modal } from "../../componentes/Modal";
import { Tabla } from "../../componentes/Tabla";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { fechaLarga, pesos } from "../../lib/formato";
import { insigniaDeParada } from "../../lib/parada";
import type { Tablero as Datos } from "../../lib/tipos";

export default function Tablero() {
  const { sesion } = useSesion();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [vista, setVista] = useState<{ tipo: string; url: string } | null>(null);

  function cargar() {
    if (!sesion) return;
    llamar<Datos>("tablero", sesion.token)
      .then(setDatos)
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar el tablero."));
  }

  useEffect(() => {
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => clearInterval(reloj);
  }, [sesion]);

  const paradas = (datos?.rutas ?? []).flatMap((ruta) => ruta.paradas.map((parada) => ({ ...parada, repartidor: ruta.repartidor })));
  const porCobrar = paradas.filter((parada) => parada.estado === "pendiente" || parada.estado === "por_cobrar").length;
  const cobradas = paradas.filter((parada) => parada.estado === "pagado" || parada.estado === "entregado").length;
  const nombres = new Map<string, string>();
  for (const ruta of datos?.rutas ?? []) {
    for (const parada of ruta.paradas) nombres.set(parada.id, parada.cliente);
  }
  for (const pedido of datos?.pedidos ?? []) nombres.set(pedido.id, pedido.cliente_alias);
  const revision = new Set((datos?.entregas_por_revisar ?? []).map((entrega) => entrega.pedido_id));

  async function verEvidencia(pedidoId: string, tipo: "foto" | "firma") {
    if (!sesion) return;
    try {
      const data = await llamar<{ url: string }>("evidencia-url", sesion.token, { pedido_id: pedidoId, tipo });
      setVista({ tipo, url: data.url });
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir la evidencia.");
    }
  }

  async function revisar(pedidoId: string) {
    if (!sesion) return;
    const nota = (notas[pedidoId] ?? "").trim();
    if (nota.length < 5) {
      setError("Escriba una nota de al menos 5 caracteres.");
      return;
    }
    setOcupado(true);
    setError("");
    try {
      await llamar("revisar-entrega", sesion.token, {
        operacion_id: crypto.randomUUID(),
        pedido_id: pedidoId,
        nota,
      });
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo marcar la revisión.");
    } finally {
      setOcupado(false);
    }
  }

  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

  return (
    <CascaronAdmin actual="tablero">
      <h1>Tablero del día</h1>
      <div className="muted">{fechaLarga(dia)} · se actualiza solo</div>
      <Aviso texto={error} />
      <AvisosReorden filas={datos?.reordenamientos ?? []} nombres={nombres} />
      <div className="kpis">
        <article className="kpi">
          <div className="v">{porCobrar}</div>
          <div className="l"><Insignia tipo="porcobrar" /> remisiones</div>
        </article>
        <article className="kpi">
          <div className="v">{cobradas}</div>
          <div className="l"><Insignia tipo="pagado" /> remisiones</div>
        </article>
        <article className="kpi">
          <div className="v">{datos?.indicadores.vencido ?? 0}</div>
          <div className="l"><Insignia tipo="vencido" /> remisiones</div>
        </article>
        <article className="kpi hero">
          <div className="v">{pesos(datos?.indicadores.cobrado ?? 0)}</div>
          <div className="l">Total cobrado</div>
        </article>
      </div>
      <div className="dos">
        <div>
          <h2>Avance de rutas</h2>
          {(datos?.rutas ?? []).map((ruta) => {
            const hechas = ruta.paradas.filter((parada) => parada.estado === "entregado").length;
            const ancho = ruta.paradas.length ? (hechas / ruta.paradas.length) * 100 : 0;
            return (
              <div key={ruta.id} className="card">
                <div className="fila">
                  <b>{ruta.repartidor}</b>
                  <span className="muted">{hechas} de {ruta.paradas.length} entregadas</span>
                </div>
                <div className="mini margen-top" role="img" aria-label={`${hechas} de ${ruta.paradas.length} paradas`}>
                  <i style={{ width: `${ancho}%` }} />
                </div>
              </div>
            );
          })}
          {(datos?.rutas ?? []).length === 0 ? <p className="muted">No hay rutas abiertas hoy.</p> : null}
        </div>
        <div>
          <h2>Resumen por repartidor</h2>
          <Tabla>
            <thead>
              <tr><th>Repartidor</th><th className="r">Remisiones</th><th className="r">Cobrado</th></tr>
            </thead>
            <tbody>
              {(datos?.rutas ?? []).map((ruta) => {
                const cobrado = ruta.paradas
                  .filter((parada) => parada.estado === "pagado" || parada.estado === "entregado")
                  .reduce((suma, parada) => suma + Number(parada.total), 0);
                return (
                  <tr key={ruta.id}>
                    <td>{ruta.repartidor}</td>
                    <td className="r">{ruta.paradas.length}</td>
                    <td className="r"><b>{pesos(cobrado)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        </div>
      </div>
      <h2 className="margen-top-lg">Entregas pendientes de revisión</h2>
      {(datos?.entregas_por_revisar ?? []).length === 0 ? <p className="muted">No hay entregas con excepción por revisar.</p> : null}
      {(datos?.entregas_por_revisar ?? []).map((entrega) => (
        <article key={entrega.pedido_id} className="card">
          <div className="fila">
            <b>Remisión {entrega.folio ?? "—"} · {entrega.cliente}</b>
            <Insignia tipo="aviso">Pendiente de revisión</Insignia>
          </div>
          <p className="muted">{entrega.repartidor} · recibió {entrega.recibe_nombre}{entrega.total != null ? ` · ${pesos(entrega.total)}` : ""}</p>
          <div className="acciones margen-top">
            <Boton chico variante="secundario" onClick={() => void verEvidencia(entrega.pedido_id, "foto")}>Ver foto</Boton>
            <Boton chico variante="secundario" onClick={() => void verEvidencia(entrega.pedido_id, "firma")}>Ver firma</Boton>
          </div>
          <label className="margen-top" htmlFor={`nota-${entrega.pedido_id}`}>
            Nota de revisión (mínimo 5 caracteres)
            <textarea
              id={`nota-${entrega.pedido_id}`}
              value={notas[entrega.pedido_id] ?? ""}
              onChange={(evento) => setNotas((actual) => ({ ...actual, [entrega.pedido_id]: evento.target.value }))}
            />
          </label>
          <Boton chico ocupado={ocupado} onClick={() => void revisar(entrega.pedido_id)}>Marcar revisada</Boton>
        </article>
      ))}
      <h2 className="margen-top-lg">Remisiones del día</h2>
      <Tabla>
        <thead>
          <tr>
            <th>Remisión</th><th>Cliente</th><th>Repartidor</th><th className="r">Parada</th>
            <th className="r">Importe</th><th>Cobro</th><th>Entrega</th>
          </tr>
        </thead>
        <tbody>
          {paradas.map((parada) => (
            <tr key={parada.id}>
              <td>
                <Link className="enlace" to={`/admin/pedido/${parada.id}`}><b>{parada.folio_documento ?? "—"}</b></Link>
                {parada.orden_compra ? <div className="muted">{parada.orden_compra}</div> : null}
              </td>
              <td>{parada.cliente}</td>
              <td>{parada.repartidor}</td>
              <td className="r">{parada.parada}</td>
              <td className="r"><b>{pesos(parada.total)}</b></td>
              <td><Insignia tipo={insigniaDeParada({ estado: parada.estado })} /></td>
              <td>{celdaEntrega(parada.estado, revision.has(parada.id))}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <Modal abierto={Boolean(vista)} titulo={vista?.tipo === "firma" ? "Firma" : "Foto"} alCerrar={() => setVista(null)}>
        <p className="muted">La dirección firmada dura 60 segundos y no se guarda en este navegador.</p>
        {vista ? <img className="ev" src={vista.url} alt={vista.tipo === "firma" ? "Firma de quien recibe" : "Foto de la entrega"} /> : null}
        <div className="margen-top">
          <Boton variante="secundario" onClick={() => setVista(null)}>Cerrar</Boton>
        </div>
      </Modal>
    </CascaronAdmin>
  );
}

function celdaEntrega(estado: string, pendiente: boolean) {
  if (pendiente) return <Insignia tipo="aviso">Pendiente de revisión</Insignia>;
  if (estado === "pagado") return <Insignia tipo="aviso">Sin entregar</Insignia>;
  if (estado === "entregado") return <span className="muted">Entregada</span>;
  return <span className="muted">—</span>;
}
