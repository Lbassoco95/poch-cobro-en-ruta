import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronAdmin } from "../../componentes/CascaronAdmin";
import { Insignia } from "../../componentes/Insignia";
import { Modal } from "../../componentes/Modal";
import { Tabla } from "../../componentes/Tabla";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, horaCorta, pesos } from "../../lib/formato";
import type { PagoDiscrepancia, Tablero } from "../../lib/tipos";

const MOTIVO: Record<string, [string, string]> = {
  monto_distinto: ["Monto distinto", "El cliente pagó una cantidad diferente al importe de la remisión."],
  fuera_de_vigencia: ["Fuera de vigencia", "El pago llegó después de que venció el cobro."],
  duplicado: ["Duplicado", "La remisión ya estaba pagada cuando llegó este segundo pago."],
  sin_cobro: ["Sin cobro", "No se encontró ninguna remisión que corresponda a este pago."],
  cobro_cancelado: ["Cobro cancelado", "El cobro ya estaba cancelado cuando llegó el pago."],
};

export default function Pagos() {
  const { sesion } = useSesion();
  const [pagos, setPagos] = useState<PagoDiscrepancia[]>([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState("");
  const [errorNota, setErrorNota] = useState("");
  const [dialogo, setDialogo] = useState<{ pago: PagoDiscrepancia; accion: "aceptar" | "devolver" | "devuelto" } | null>(null);

  function cargar() {
    if (!sesion) return;
    llamar<Tablero>("tablero", sesion.token)
      .then((datos) => setPagos(datos.discrepancias ?? []))
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudieron cargar los pagos."));
  }

  useEffect(() => {
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => clearInterval(reloj);
  }, [sesion]);

  async function confirmar() {
    if (!sesion || !dialogo) return;
    if (nota.trim().length < 5) {
      setErrorNota("La nota es obligatoria (mínimo 5 caracteres).");
      return;
    }
    setOcupado(true);
    setError("");
    try {
      await llamar("resolver-pago", sesion.token, {
        operacion_id: crypto.randomUUID(),
        pago_id: dialogo.pago.id,
        accion: dialogo.accion,
        nota: nota.trim(),
      });
      setDialogo(null);
      setNota("");
      cargar();
    } catch (fallo) {
      setErrorNota(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo resolver el pago.");
    } finally {
      setOcupado(false);
    }
  }

  function abrir(pago: PagoDiscrepancia, accion: "aceptar" | "devolver" | "devuelto") {
    setNota("");
    setErrorNota("");
    setDialogo({ pago, accion });
  }

  return (
    <CascaronAdmin actual="pagos">
      <h1>Pagos por resolver</h1>
      <p className="muted">Pagos que llegaron con alguna discrepancia. Toda resolución exige una nota.</p>
      <Aviso tono="info">El sistema no devuelve dinero. «Devolver» deja la devolución pendiente y usted la hace desde su banco.</Aviso>
      <Aviso texto={error} />
      <p className="muted">El tablero no envía el importe esperado del cobro. Aquí solo se muestra lo que sí llegó.</p>
      <Tabla>
        <thead>
          <tr>
            <th>Motivo</th>
            <th>Remisión</th>
            <th className="r">Pagó</th>
            <th>Pagador</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => {
            const [titulo, detalle] = MOTIVO[pago.resultado] ?? [etiqueta(pago.resultado), ""];
            const puedeAceptar = pago.resultado === "fuera_de_vigencia";
            return (
              <tr key={pago.id}>
                <td>
                  <Insignia tipo="aviso">⚠ {titulo}</Insignia>
                  {detalle ? <div className="muted">{detalle}</div> : null}
                </td>
                <td>
                  {pago.folio ? (
                    <Link className="enlace" to={`/admin/pedido/${pago.pedido_id}`}><b>{pago.folio}</b></Link>
                  ) : (
                    <span className="muted">— (ninguna)</span>
                  )}
                </td>
                <td className="r"><b>{pesos(pago.monto)}</b></td>
                <td>
                  {pago.pagador_banco ?? "Banco no informado"}
                  <div className="muted">
                    CLABE ····{pago.pagador_clabe_ultimos4 ?? "----"}
                    <br />
                    Rastreo {pago.clave_rastreo ?? "—"}
                    <br />
                    {horaCorta(pago.pagado_en ?? pago.recibido_en)} h
                  </div>
                </td>
                <td>
                  {pago.resolucion ? (
                    <>
                      <Insignia tipo={pago.resolucion === "aceptado" ? "ok" : "aviso"}>
                        {pago.resolucion === "aceptado" ? "✔ Aceptado" : pago.resolucion === "devuelto" ? "Devuelto" : "↩ Devolución pendiente"}
                      </Insignia>
                      {pago.nota_resolucion ? <div className="muted">Nota: {pago.nota_resolucion}</div> : null}
                      {pago.resolucion === "devolucion_pendiente" ? (
                        <div className="margen-top">
                          <Boton chico variante="secundario" onClick={() => abrir(pago, "devuelto")}>Marcar devuelto</Boton>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="acciones">
                        <Boton chico disabled={!puedeAceptar} onClick={() => abrir(pago, "aceptar")}>Aceptar</Boton>
                        <Boton chico variante="secundario" onClick={() => abrir(pago, "devolver")}>Devolver</Boton>
                      </div>
                      {!puedeAceptar ? (
                        <div className="muted">Aceptar solo aplica a pagos fuera de vigencia.</div>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
      {pagos.length === 0 ? <p>No hay pagos con discrepancia.</p> : null}
      <Modal
        abierto={Boolean(dialogo)}
        titulo={dialogo?.accion === "aceptar" ? "Aceptar pago" : dialogo?.accion === "devuelto" ? "Marcar devuelto" : "Devolver pago"}
        alCerrar={() => setDialogo(null)}
      >
        {dialogo ? (
          <>
            <p className="muted">
              {etiqueta(dialogo.pago.resultado)} · {pesos(dialogo.pago.monto)} · {dialogo.pago.pagador_banco ?? "Banco no informado"} · rastreo {dialogo.pago.clave_rastreo ?? "—"}
            </p>
            {dialogo.accion === "aceptar" ? (
              <Aviso tono="info">La remisión pasará a pagada si el servidor acepta el pago.</Aviso>
            ) : (
              <Aviso tono="ambar">Quedará como devolución pendiente, o como devuelta si ya la hizo en el banco. La devolución real se hace desde el banco.</Aviso>
            )}
            <label htmlFor="nota-pago">Nota obligatoria (mínimo 5 caracteres)</label>
            <textarea id="nota-pago" value={nota} placeholder="Explique la decisión" onChange={(evento) => setNota(evento.target.value)} />
            <Aviso texto={errorNota} />
            <div className="acciones">
              <Boton chico ocupado={ocupado} onClick={() => void confirmar()}>Confirmar</Boton>
              <Boton chico variante="secundario" onClick={() => setDialogo(null)}>Cancelar</Boton>
            </div>
          </>
        ) : null}
      </Modal>
    </CascaronAdmin>
  );
}
