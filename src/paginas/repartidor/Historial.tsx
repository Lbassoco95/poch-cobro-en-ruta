import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { Vidrio } from "../../componentes/Vidrio";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { fechaLarga, horaCorta, pesos } from "../../lib/formato";
import type { TipoInsignia } from "../../lib/parada";

type Parada = {
  id: string;
  folio: number;
  cliente: string;
  total: number;
  estado: string;
  actualizado_en: string;
  folio_documento: string | null;
  orden_compra: string | null;
};

type Respuesta = {
  periodo: string;
  total_cobrado: number;
  paradas: Parada[];
};

function insignia(estado: string): TipoInsignia {
  if (estado === "entregado") return "entregado";
  if (estado === "cancelado") return "cancelado";
  if (estado === "devuelto") return "devuelto";
  if (estado === "pagado") return "pagado";
  return "porcobrar";
}

export default function Historial() {
  const { sesion } = useSesion();
  const [periodo, setPeriodo] = useState<"hoy" | "semana">("hoy");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    llamar<Respuesta>("mi-historial", sesion.token, { periodo })
      .then((data) => {
        if (activo) setDatos(data);
      })
      .catch((fallo: unknown) => {
        if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar el historial.");
      });
    return () => {
      activo = false;
    };
  }, [sesion, periodo]);

  const paradas = datos?.paradas ?? [];
  const entregas = paradas.filter((parada) => parada.estado === "entregado").length;
  const sinCobro = paradas.filter((parada) => parada.estado === "cancelado" || parada.estado === "devuelto").length;
  const dias = [...new Set(paradas.map((parada) => parada.actualizado_en.slice(0, 10)))];

  return (
    <CascaronRepartidor titulo="Historial" pestana="historial">
      <div className="pad">
        <Aviso texto={error} />
        <div className="grupo" role="group" aria-label="Periodo">
          <button type="button" className="chip" aria-pressed={periodo === "hoy"} onClick={() => setPeriodo("hoy")}>Hoy</button>
          <button type="button" className="chip" aria-pressed={periodo === "semana"} onClick={() => setPeriodo("semana")}>Esta semana</button>
        </div>
        <Vidrio destacado>
          <div className="hielo">Cobrado {periodo === "hoy" ? "hoy" : "esta semana"}</div>
          <div className="monto" style={{ fontSize: 34 }}>{pesos(datos?.total_cobrado ?? 0)}</div>
          <div className="hielo margen-top">
            {entregas} {entregas === 1 ? "entrega" : "entregas"} · {sinCobro} sin cobrar
          </div>
        </Vidrio>
        {paradas.length === 0 && !error ? <p>No hay cobros cerrados en este periodo.</p> : null}
        {dias.map((dia) => (
          <section key={dia}>
            <h3 className="margen-top-lg">{fechaLarga(dia)}</h3>
            {paradas.filter((parada) => parada.actualizado_en.slice(0, 10) === dia).map((parada) => (
              <Link key={parada.id} className="card" to={`/repartidor/parada/${parada.id}`} style={{ display: "block", minHeight: "var(--toque)" }}>
                <div className="fila">
                  <b>Remisión {parada.folio_documento ?? parada.folio}</b>
                  <Insignia tipo={insignia(parada.estado)} />
                </div>
                <div className="fila margen-top">
                  <span className="nombre">{parada.cliente}</span>
                  <span className="monto">{pesos(parada.total)}</span>
                </div>
                <div className="muted">
                  {horaCorta(parada.actualizado_en)} h
                  {parada.orden_compra ? ` · ${parada.orden_compra}` : ""}
                </div>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </CascaronRepartidor>
  );
}
