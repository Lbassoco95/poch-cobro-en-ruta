import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { Vidrio } from "../../componentes/Vidrio";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { fechaLarga, pesos } from "../../lib/formato";
import { insigniaDeParada, piezasDe, textoBotonParada, textoPiezas } from "../../lib/parada";
import { gruposDe } from "../../lib/ruta";
import type { ParadaRuta, RespuestaRuta } from "../../lib/tipos";

export default function MiRuta() {
  const { sesion } = useSesion();
  const location = useLocation();
  const avisoOrden = typeof location.state === "object" && location.state && "aviso" in location.state
    ? String((location.state as { aviso?: string }).aviso ?? "")
    : "";
  const [datos, setDatos] = useState<RespuestaRuta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<RespuestaRuta>("mi-ruta", sesion.token)
        .then((data) => {
          if (activo) setDatos(data);
        })
        .catch((fallo: unknown) => {
          if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar la ruta.");
        });
    };
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, [sesion]);

  useEffect(() => {
    if (!datos?.siguiente_parada) return;
    const zona = document.getElementById("contenido");
    const parada = document.getElementById(`parada-${datos.siguiente_parada}`);
    if (!zona || !parada) return;
    const top = parada.getBoundingClientRect().top - zona.getBoundingClientRect().top + zona.scrollTop;
    zona.scrollTop = Math.max(0, top - 12);
  }, [datos?.siguiente_parada]);

  const grupos = gruposDe(datos);

  return (
    <CascaronRepartidor titulo="Mi ruta" pestana="ruta">
      <div className="pad">
        <Aviso texto={error} />
        {avisoOrden ? <Aviso tono="ok">{avisoOrden}</Aviso> : null}
        {!grupos.length && !error ? <p>No hay una ruta abierta.</p> : null}
        {grupos.map((grupo) => {
          const movibles = grupo.paradas.filter((parada) => parada.estado === "pendiente" || parada.estado === "por_cobrar");
          const entregadas = grupo.resumen.entregadas;
          const total = grupo.paradas.length;
          const avance = total ? (entregadas / total) * 100 : 0;
          return (
            <section key={grupo.ruta.id} aria-label={`Ruta ${grupo.ruta.nombre}`} className="margen-top">
              <h2 style={{ marginBottom: 6 }}>{grupo.ruta.nombre}</h2>
              <Vidrio destacado>
                <div className="hielo">{grupo.ruta.fecha ? fechaLarga(grupo.ruta.fecha) : fechaLarga(datos?.dia)} · {total} paradas</div>
                <div className="fila margen-top">
                  <div>
                    <div className="monto" style={{ fontSize: 30 }}>{entregadas} de {total}</div>
                    <div className="hielo">entregadas</div>
                  </div>
                  <div className="derecha">
                    <div className="hielo">Cobrado</div>
                    <div className="monto" style={{ fontSize: 22 }}>{pesos(grupo.resumen.cobrado)}</div>
                    <div className="hielo">Por cobrar {pesos(grupo.resumen.por_cobrar)}</div>
                  </div>
                </div>
                <div className="barra margen-top" role="img" aria-label={`${entregadas} de ${total} paradas entregadas`}>
                  <i style={{ width: `${avance}%` }} />
                </div>
              </Vidrio>
              {movibles.length >= 2 ? (
                <Link className="btn sec" to={`/repartidor/orden?ruta=${grupo.ruta.id}`}>↕ Cambiar orden de paradas</Link>
              ) : null}
              <div className="margen-top">
                {grupo.paradas.map((parada) => (
                  <ParadaCard key={parada.id} parada={parada} siguiente={grupo.siguiente_parada === parada.id} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </CascaronRepartidor>
  );
}

function ParadaCard({ parada, siguiente }: { parada: ParadaRuta; siguiente: boolean }) {
  const fin = parada.estado === "entregado" || parada.estado === "cancelado" || parada.estado === "devuelto";
  const numero = parada.estado === "entregado" ? "✔" : fin ? "✖" : String(parada.parada);
  const claseNum = parada.estado === "entregado" ? "ok" : fin ? "mal" : siguiente ? "ya" : "";
  const piezas = piezasDe(parada.piezas);
  const folio = parada.folio_documento ?? String(parada.folio);
  return (
    <article id={`parada-${parada.id}`} className={`card parada${parada.estado === "entregado" ? " hecha" : ""}${siguiente ? " sig" : ""}`}>
      <div className="fila" style={{ alignItems: "flex-start" }}>
        <div className={`num ${claseNum}`} aria-label={`Parada ${parada.parada}`}>{numero}</div>
        <div className="crece">
          <div className="fila" style={{ alignItems: "flex-start" }}>
            <div className="nombre">
              <b>{parada.cliente_alias}</b>
            </div>
            <span className="monto" style={{ fontSize: 18 }}>{pesos(parada.total)}</span>
          </div>
          <div className="muted margen-top">
            Remisión {folio}
            {parada.orden_compra_ref ? ` · ${parada.orden_compra_ref}` : ""}
            {" · "}
            {textoPiezas(piezas)}
          </div>
          <div className="grupo margen-top">
            <Insignia tipo={insigniaDeParada(parada)} />
            {siguiente ? <Insignia tipo="aviso">➜ Siguiente parada</Insignia> : null}
          </div>
        </div>
      </div>
      <Link className={`btn margen-top${siguiente || parada.estado === "pagado" ? "" : " sec"}`} to={`/repartidor/parada/${parada.id}`}>
        {textoBotonParada(parada)}
      </Link>
    </article>
  );
}
