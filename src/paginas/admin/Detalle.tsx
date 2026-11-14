import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, fechaHora, pesos } from "../../lib/formato";

type DetallePedido = {
  pedido: { id: string; folio: number; cliente_alias: string; total: number; estado: string; repartidor: string };
  lineas: Array<{ cantidad: number; precio_unitario: number; subtotal: number; producto: { nombre: string; sku: string } | null }>;
  cobro: { concepto: string; estado: string; importe: number; vigencia_hasta: string; comprobante_clave?: string | null } | null;
  intentos: Array<{ id: string; metodo: string; estado: string; num_ref: string; creado_en: string }>;
  pagos: Array<{
    monto: number;
    resultado: string;
    clave_rastreo: string | null;
    pagado_en: string;
    pagador_banco: string | null;
    pagador_tipo_cuenta: string | null;
    pagador_clabe_ultimos4: string | null;
  }>;
  bitacora: Array<{ id: number; ocurrio_en: string; actor: string; accion: string; detalle: Record<string, unknown> }>;
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
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir el pedido."));
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

  return (
    <Marco titulo={`Pedido ${datos?.pedido.folio ?? ""}`} ancho="max-w-4xl" enlaces={[{ a: "/admin", texto: "Tablero" }]}>
      <Aviso texto={error} />
      <p className="text-lg">{datos?.pedido.cliente_alias} · {datos?.pedido.repartidor}</p>
      <p className="mt-1 text-2xl font-semibold">{datos ? pesos(datos.pedido.total) : ""} · {etiqueta(datos?.pedido.estado)}</p>
      <p className="mt-1">{datos?.cobro?.concepto} · cobro {etiqueta(datos?.cobro?.estado)}</p>
      <h2 className="mt-6 text-xl font-semibold">Piezas</h2>
      <ul className="mt-2 space-y-1">
        {(datos?.lineas ?? []).map((linea, indice) => (
          <li key={`${linea.producto?.sku ?? "pieza"}-${indice}`}>
            {linea.cantidad} × {linea.producto?.nombre ?? "Pieza"} · {pesos(linea.subtotal)}
          </li>
        ))}
      </ul>
      <h2 className="mt-6 text-xl font-semibold">Intentos</h2>
      <ul className="mt-2 space-y-1">
        {(datos?.intentos ?? []).map((intento) => (
          <li key={intento.id}>{etiqueta(intento.metodo)} · referencia {intento.num_ref} · {etiqueta(intento.estado)}</li>
        ))}
      </ul>
      <h2 className="mt-6 text-xl font-semibold">Pagos y pagador</h2>
      <ul className="mt-2 space-y-2">
        {(datos?.pagos ?? []).map((pago, indice) => (
          <li key={`${pago.pagado_en}-${indice}`} className="rounded-2xl border border-linea bg-white p-3 text-sm">
            {etiqueta(pago.resultado)} · {pesos(pago.monto)} · banco {pago.pagador_banco ?? "—"} · tipo {pago.pagador_tipo_cuenta ?? "—"} · CLABE ····{pago.pagador_clabe_ultimos4 ?? "----"} · {pago.clave_rastreo ?? "sin clave"}
          </li>
        ))}
      </ul>
      {datos?.cobro?.comprobante_clave && (
        <p className="mt-3 text-sm">
          Comprobante del cliente: <a className="text-jade" href={`/c/${datos.cobro.comprobante_clave}`}>/c/{datos.cobro.comprobante_clave.slice(0, 8)}…</a>
        </p>
      )}
      <h2 className="mt-6 text-xl font-semibold">Bitácora</h2>
      <ol className="mt-2 space-y-3">
        {(datos?.bitacora ?? []).map((fila) => (
          <li key={fila.id} className="rounded-2xl border border-linea bg-white p-3">
            <p className="font-medium">{etiqueta(fila.accion)}</p>
            <p className="text-sm text-marino/70">{fechaHora(fila.ocurrio_en)} · {fila.actor}</p>
          </li>
        ))}
      </ol>
      {datos?.pedido.estado === "por_cobrar" && (
        <div className="mt-6 max-w-sm">
          <Boton secundario onClick={() => void cancelar()} ocupado={ocupado}>Cancelar pedido</Boton>
        </div>
      )}
    </Marco>
  );
}
