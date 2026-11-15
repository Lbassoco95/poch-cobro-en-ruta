import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronAdmin } from "../../componentes/CascaronAdmin";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, fechaHora, pesos } from "../../lib/formato";

type DetallePedido = {
  pedido: {
    id: string;
    folio: number;
    cliente_alias: string;
    total: number;
    estado: string;
    repartidor: string;
    ruta_id?: string | null;
    folio_documento?: string | null;
    orden_compra_ref?: string | null;
    parada?: number | null;
  };
  lineas: Array<{ cantidad: number; precio_unitario: number; subtotal: number; producto: { nombre: string; sku: string } | null }>;
  cobro: { concepto: string; estado: string; importe: number; comprobante_clave?: string | null } | null;
  intentos: Array<{ id: string; metodo: string; estado: string; num_ref: string }>;
  pagos: Array<{
    monto: number;
    resultado: string;
    clave_rastreo: string | null;
    pagado_en: string;
    pagador_banco: string | null;
    pagador_clabe_ultimos4: string | null;
  }>;
  evidencia: {
    recibe_nombre: string;
    tiene_foto: boolean;
    tiene_firma: boolean;
    excepcion: string | null;
    nota: string | null;
    requiere_revision: boolean;
    revisada: boolean;
  } | null;
  bitacora: Array<{ id: number; ocurrio_en: string; actor: string; accion: string }>;
};

export default function Detalle() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const operacion = useRef(crypto.randomUUID());
  const [datos, setDatos] = useState<DetallePedido | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function cargar() {
    if (!sesion) return;
    llamar<DetallePedido>("tablero", sesion.token, { pedido_id: pedidoId })
      .then(setDatos)
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir la remisión."));
  }

  useEffect(() => {
    cargar();
  }, [sesion, pedidoId]);

  async function cancelar() {
    if (!sesion) return;
    setOcupado(true);
    try {
      await llamar("cancelar-pedido", sesion.token, { operacion_id: operacion.current, pedido_id: pedidoId });
      operacion.current = crypto.randomUUID();
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cancelar.");
    } finally {
      setOcupado(false);
    }
  }

  const pedido = datos?.pedido;

  return (
    <CascaronAdmin actual="tablero">
      <h1>Remisión {pedido?.folio_documento ?? pedido?.folio ?? ""}</h1>
      <Aviso texto={error} />
      {pedido ? (
        <>
          <p>{pedido.cliente_alias} · {pedido.repartidor}</p>
          <p className="monto" style={{ fontSize: 28 }}>{pesos(pedido.total)} · {etiqueta(pedido.estado)}</p>
          <p className="muted">
            {pedido.parada ? `Parada ${pedido.parada}` : "Sin número de parada"}
            {pedido.orden_compra_ref ? ` · ${pedido.orden_compra_ref}` : ""}
          </p>
          <p className="muted">{datos?.cobro?.concepto} · cobro {etiqueta(datos?.cobro?.estado)}</p>
          <h2>Piezas</h2>
          <ul>
            {(datos?.lineas ?? []).map((linea, indice) => (
              <li key={`${linea.producto?.sku ?? "pieza"}-${indice}`}>
                {linea.cantidad} × {linea.producto?.nombre ?? "Pieza"} · {pesos(linea.subtotal)}
              </li>
            ))}
          </ul>
          <h2>Intentos</h2>
          <ul>
            {(datos?.intentos ?? []).map((intento) => (
              <li key={intento.id}>{etiqueta(intento.metodo)} · referencia {intento.num_ref} · {etiqueta(intento.estado)}</li>
            ))}
          </ul>
          <h2>Pagos y pagador</h2>
          <ul>
            {(datos?.pagos ?? []).map((pago, indice) => (
              <li key={`${pago.pagado_en}-${indice}`}>
                {etiqueta(pago.resultado)} · {pesos(pago.monto)} · banco {pago.pagador_banco ?? "—"} · CLABE ····{pago.pagador_clabe_ultimos4 ?? "----"} · {pago.clave_rastreo ?? "sin clave"}
              </li>
            ))}
          </ul>
          {datos?.evidencia ? (
            <>
              <h2>Evidencia</h2>
              <p>Recibió {datos.evidencia.recibe_nombre}. Foto: {datos.evidencia.tiene_foto ? "sí" : "no"}. Firma: {datos.evidencia.tiene_firma ? "sí" : "no"}.</p>
              {datos.evidencia.excepcion ? <p>Excepción: {datos.evidencia.excepcion}. {datos.evidencia.nota}</p> : null}
              <p className="muted">{datos.evidencia.requiere_revision ? (datos.evidencia.revisada ? "Revisada." : "Pendiente de revisión.") : "Sin excepción."}</p>
            </>
          ) : null}
          {datos?.cobro?.comprobante_clave ? (
            <p className="muted">
              Comprobante del cliente: <a className="enlace" href={`/c/${datos.cobro.comprobante_clave}`}>abrir</a>
            </p>
          ) : null}
          <h2>Bitácora de esta remisión</h2>
          <ol>
            {(datos?.bitacora ?? []).map((fila) => (
              <li key={fila.id}>{etiqueta(fila.accion)} · {fechaHora(fila.ocurrio_en)}</li>
            ))}
          </ol>
          {pedido.estado === "por_cobrar" && !pedido.ruta_id ? (
            <div className="margen-top" style={{ maxWidth: 280 }}>
              <Boton variante="peligro" ocupado={ocupado} onClick={() => void cancelar()}>Cancelar pedido</Boton>
            </div>
          ) : null}
          {pedido.ruta_id ? (
            <p className="muted">En ruta el documento se devuelve desde el celular del repartidor. Aquí no se cancela.</p>
          ) : null}
        </>
      ) : null}
    </CascaronAdmin>
  );
}
