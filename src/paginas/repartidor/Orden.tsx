import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { pesos } from "../../lib/formato";
import { elegirRuta } from "../../lib/ruta";
import {
  MOTIVOS_ORDEN,
  insigniaDeParada,
  paradaSePuedeMover,
  puedeIntercambiar,
  type EtiquetaMotivo,
} from "../../lib/parada";
import type { ParadaRuta, RespuestaRuta } from "../../lib/tipos";

export default function Orden() {
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const rutaPedida = parametros.get("ruta");
  const [rutaId, setRutaId] = useState("");
  const [fijas, setFijas] = useState<ParadaRuta[]>([]);
  const [orden, setOrden] = useState<ParadaRuta[]>([]);
  const [huecos, setHuecos] = useState<number[]>([]);
  const [origen, setOrigen] = useState<string[]>([]);
  const [motivo, setMotivo] = useState<EtiquetaMotivo | "">("");
  const [ultima, setUltima] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    llamar<RespuestaRuta>("mi-ruta", sesion.token)
      .then((respuesta) => {
        const datos = elegirRuta(respuesta, rutaPedida);
        if (!datos) {
          setError("No hay una ruta abierta.");
          return;
        }
        setRutaId(datos.ruta.id);
        const movibles = datos.paradas.filter((parada) => parada.estado === "pendiente" || parada.estado === "por_cobrar");
        setOrden(movibles);
        setHuecos(movibles.map((parada) => parada.parada));
        setOrigen(movibles.map((parada) => parada.id));
        setFijas(datos.paradas.filter((parada) => parada.estado !== "pendiente" && parada.estado !== "por_cobrar"));
      })
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar la ruta."));
  }, [sesion, rutaPedida]);

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (!puedeIntercambiar(orden, indice, destino)) return;
    const copia = [...orden];
    const [item] = copia.splice(indice, 1);
    if (!item) return;
    copia.splice(destino, 0, item);
    const zona = document.getElementById("contenido");
    const scroll = zona?.scrollTop ?? 0;
    setUltima(item.id);
    setOrden(copia);
    requestAnimationFrame(() => {
      const nodo = document.getElementById("contenido");
      if (nodo) nodo.scrollTop = scroll;
    });
  }

  const cambio = orden.map((parada) => parada.id).join() !== origen.join();
  const textoMotivo = MOTIVOS_ORDEN.find((item) => item.etiqueta === motivo)?.texto ?? "";
  const listo = cambio && textoMotivo.length >= 5;

  async function guardar() {
    if (!sesion || !listo) return;
    setOcupado(true);
    setError("");
    try {
      await llamar("reordenar-paradas", sesion.token, {
        operacion_id: crypto.randomUUID(),
        ruta_id: rutaId,
        orden: orden.map((parada) => parada.id),
        motivo: textoMotivo,
      });
      navegar("/repartidor", { state: { aviso: "Orden guardado. Se avisó a administración." } });
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo guardar el orden.");
      setOcupado(false);
    }
  }

  return (
    <CascaronRepartidor titulo="Cambiar orden" atras="/repartidor">
      <div className="pad">
        <Aviso tono="info">
          Mueva las paradas con ▲ y ▼. Las ya atendidas no se mueven. Al guardar se avisa a administración.
        </Aviso>
        <Aviso texto={error} />
        {fijas.length > 0 ? (
          <>
            <h3>Ya atendidas (no se mueven)</h3>
            {fijas.map((parada) => (
              <div key={parada.id} className="card bloq">
                <div className="fila">
                  <div className={`num ${parada.estado === "entregado" ? "ok" : "mal"}`}>
                    {parada.estado === "entregado" ? "✔" : "✖"}
                  </div>
                  <div className="crece">
                    <b className="nombre">{parada.cliente_alias}</b>
                    <div className="muted">Remisión {parada.folio_documento ?? parada.folio}</div>
                  </div>
                  <Insignia tipo={insigniaDeParada(parada)} />
                </div>
              </div>
            ))}
          </>
        ) : null}
        <h3 className="margen-top">Paradas por atender</h3>
        {orden.map((parada, indice) => {
          const fijaPorCobro = !paradaSePuedeMover(parada);
          return (
            <div key={parada.id} className={`card${ultima === parada.id ? " movida" : ""}`}>
              <div className="fila">
                <div className="num ya" aria-label={`Parada ${huecos[indice] ?? indice + 1}`}>{huecos[indice] ?? indice + 1}</div>
                <div className="crece">
                  <b className="nombre">{parada.cliente_alias}</b>
                  <div className="muted">{pesos(parada.total)}</div>
                  <div className="margen-top"><Insignia tipo={insigniaDeParada(parada)} /></div>
                  {fijaPorCobro ? <div className="muted">Cobro en curso. Esta parada no se mueve.</div> : null}
                </div>
                <div className="mov">
                  <button
                    type="button"
                    aria-label={`Subir ${parada.cliente_alias}`}
                    disabled={!puedeIntercambiar(orden, indice, indice - 1)}
                    onClick={() => mover(indice, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${parada.cliente_alias}`}
                    disabled={!puedeIntercambiar(orden, indice, indice + 1)}
                    onClick={() => mover(indice, 1)}
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <h3 className="margen-top-lg">Motivo del cambio</h3>
        <div className="grupo" role="group" aria-label="Motivo">
          {MOTIVOS_ORDEN.map((item) => (
            <button
              key={item.etiqueta}
              type="button"
              className="chip"
              aria-pressed={motivo === item.etiqueta}
              onClick={() => setMotivo(item.etiqueta)}
            >
              {item.etiqueta}
            </button>
          ))}
        </div>
        <div className="margen-top-lg">
          <Boton disabled={!listo} ocupado={ocupado} onClick={() => void guardar()}>
            Guardar orden y avisar
          </Boton>
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          {!cambio ? "Mueva al menos una parada." : !motivo ? "Elija el motivo del cambio." : "Se avisará a administración."}
        </p>
        <div className="margen-top">
          <Boton variante="secundario" onClick={() => navegar("/repartidor")}>Cancelar</Boton>
        </div>
      </div>
    </CascaronRepartidor>
  );
}
