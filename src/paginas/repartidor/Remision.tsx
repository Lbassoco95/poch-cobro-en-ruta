import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { Vidrio } from "../../componentes/Vidrio";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { guardarQr, pesos, srcQr } from "../../lib/formato";
import { insigniaDeParada, textoPiezas } from "../../lib/parada";
import type { EstadoPedido } from "../../lib/tipos";

export default function Remision() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const opAbrir = useRef(crypto.randomUUID());
  const opIntento = useRef(crypto.randomUUID());
  const [estado, setEstado] = useState<EstadoPedido | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<EstadoPedido>("estado-pedido", sesion.token, { pedido_id: pedidoId })
        .then((data) => {
          if (activo) setEstado(data);
        })
        .catch((fallo: unknown) => {
          if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir la remisión.");
        });
    };
    cargar();
    const reloj = setInterval(cargar, 3000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, [sesion, pedidoId]);

  async function cobrar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      let cobroId = estado?.cobro?.id;
      const vigente = Boolean(
        estado?.cobro && ["emitido", "en_proceso"].includes(estado.cobro.estado) && new Date(estado.cobro.vigencia_hasta).getTime() > Date.now(),
      );
      if (!vigente) {
        const abierto = await llamar<{ cobro_id: string }>("abrir-cobro", sesion.token, {
          operacion_id: opAbrir.current,
          pedido_id: pedidoId,
          vigencia_min: 6,
        });
        opAbrir.current = crypto.randomUUID();
        cobroId = abierto.cobro_id;
      }
      if (!cobroId) throw new ErrorDeApi("No se pudo abrir el cobro.");
      const data = await llamar<{ qr_imagen?: string }>("crear-intento-pago", sesion.token, {
        operacion_id: opIntento.current,
        cobro_id: cobroId,
        metodo: "qr",
      });
      opIntento.current = crypto.randomUUID();
      if (data.qr_imagen) guardarQr(pedidoId, srcQr(data.qr_imagen));
      navegar(`/repartidor/cobrar/${pedidoId}`);
    } catch (fallo) {
      if (fallo instanceof ErrorDeApi && fallo.codigo === "INTENTO_VIGENTE") {
        navegar(`/repartidor/cobrar/${pedidoId}`);
        return;
      }
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo generar el cobro.");
      opIntento.current = crypto.randomUUID();
      setOcupado(false);
    }
  }

  const pedido = estado?.pedido;
  const insignia = pedido ? insigniaDeParada({
    estado: pedido.estado,
    cobro: estado?.cobro ? { estado: estado.cobro.estado, vigente: estado.segundos > 0 && estado.intento?.estado === "creado" } : null,
  }) : "porcobrar";
  const piezas = (estado?.lineas ?? []).reduce((suma, linea) => suma + Number(linea.cantidad), 0);
  const puedeOtro = pedido && (pedido.estado === "pendiente" || pedido.estado === "por_cobrar")
    && (estado?.cobro?.estado === "vencido" || (estado?.intento && estado.segundos <= 0))
    && (estado?.quedan_intentos ?? 0) > 0;

  return (
    <CascaronRepartidor titulo="Remisión" atras="/repartidor">
      <div className="pad">
        <Aviso texto={error} />
        {!pedido && !error ? <p role="status">Cargando…</p> : null}
        {pedido && estado ? (
          <>
            <Vidrio>
              <div className="fila">
                <div>
                  <div className="muted">Remisión</div>
                  <div className="monto" style={{ fontSize: 26 }}>{pedido.folio_documento ?? pedido.folio}</div>
                </div>
                <Insignia tipo={insignia} />
              </div>
              <div className="margen-top">
                <b className="nombre">{pedido.cliente_alias}</b>
                <div className="muted">
                  {pedido.zona ?? "Sin zona"} · Parada {pedido.parada ?? "—"}
                  {pedido.orden_compra_ref ? ` · ${pedido.orden_compra_ref}` : ""}
                </div>
              </div>
            </Vidrio>
            <h3>Piezas por entregar</h3>
            <Vidrio>
              {estado.lineas.map((linea, indice) => (
                <div key={`${linea.producto?.nombre ?? "pieza"}-${indice}`} className="fila" style={{ padding: "8px 0", borderBottom: "1px solid var(--linea)" }}>
                  <div className="nombre">
                    <b>{linea.producto?.nombre ?? "Pieza"}</b>
                    <div className="muted">{linea.cantidad} × {pesos(linea.precio_unitario ?? 0)}</div>
                  </div>
                  <span className="monto">{pesos(linea.subtotal)}</span>
                </div>
              ))}
              <div className="fila margen-top">
                <b>Total a cobrar</b>
                <span className="monto" style={{ fontSize: 30 }}>{pesos(pedido.total)}</span>
              </div>
            </Vidrio>
            {insignia === "porcobrar" ? (
              <>
                <Boton ocupado={ocupado} onClick={() => void cobrar()}>Cobrar {pesos(pedido.total)} con CoDi</Boton>
                <p className="muted" style={{ textAlign: "center" }}>Se genera un QR por el monto de esta remisión.</p>
              </>
            ) : null}
            {insignia === "pendiente" ? (
              <Boton onClick={() => navegar(`/repartidor/cobrar/${pedidoId}`)}>Ver cobro (QR)</Boton>
            ) : null}
            {pedido.estado === "pagado" ? (
              <>
                <Boton variante="entrega" onClick={() => navegar(`/repartidor/entrega/${pedidoId}`)}>📦 Marcar entrega</Boton>
                <p className="muted" style={{ textAlign: "center" }}>Se pide foto de las piezas y firma de quien recibe.</p>
              </>
            ) : null}
            {puedeOtro && insignia === "vencido" ? (
              <Boton ocupado={ocupado} onClick={() => void cobrar()}>
                ↻ Generar otro QR · intento {Math.min((estado.intentos_desde_apertura ?? 0) + 1, 5)} de 5
              </Boton>
            ) : null}
            {insignia !== "porcobrar" ? (
              <div className="margen-top">
                <Boton variante="secundario" onClick={() => navegar(`/repartidor/estado/${pedidoId}`)}>Ver estado del cobro</Boton>
              </div>
            ) : null}
            <p className="muted margen-top">{textoPiezas(piezas)}</p>
          </>
        ) : null}
      </div>
    </CascaronRepartidor>
  );
}
