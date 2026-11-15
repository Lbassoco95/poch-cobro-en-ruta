import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { Modal } from "../../componentes/Modal";
import { Pips } from "../../componentes/Pips";
import { Vidrio } from "../../componentes/Vidrio";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { borrarQr, guardarQr, pesos, srcQr } from "../../lib/formato";
import type { TipoInsignia } from "../../lib/parada";
import type { EstadoPedido } from "../../lib/tipos";

function vistaDe(estado: EstadoPedido): TipoInsignia {
  const pedido = estado.pedido.estado;
  if (pedido === "entregado") return "entregado";
  if (pedido === "pagado") return "pagado";
  if (pedido === "cancelado") return "cancelado";
  if (pedido === "devuelto") return "devuelto";
  if (estado.intento?.estado === "creado" && estado.segundos > 0) return "pendiente";
  if ((estado.intentos_desde_apertura ?? 0) > 0 || estado.cobro?.estado === "vencido" || estado.intento?.estado === "expirado") {
    return "vencido";
  }
  return "porcobrar";
}

const BORDE: Partial<Record<TipoInsignia, string>> = {
  pagado: "var(--aqua)",
  entregado: "var(--aqua)",
  pendiente: "var(--azul-hielo)",
  vencido: "var(--rojo)",
  cancelado: "var(--rojo)",
  devuelto: "var(--rojo)",
};

export default function EstadoCobro() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const opAbrir = useRef(crypto.randomUUID());
  const opIntento = useRef(crypto.randomUUID());
  const opDevolver = useRef(crypto.randomUUID());
  const [estado, setEstado] = useState<EstadoPedido | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(0);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorModal, setErrorModal] = useState("");

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<EstadoPedido>("estado-pedido", sesion.token, { pedido_id: pedidoId })
        .then((data) => {
          if (activo) setEstado(data);
        })
        .catch((fallo: unknown) => {
          if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo consultar el cobro.");
        });
    };
    cargar();
    const reloj = setInterval(cargar, 3000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, [sesion, pedidoId]);

  useEffect(() => {
    if (espera <= 0) return;
    const reloj = setTimeout(() => setEspera((actual) => actual - 1), 1000);
    return () => clearTimeout(reloj);
  }, [espera]);

  async function otroQr() {
    if (!sesion || !estado) return;
    setOcupado(true);
    setError("");
    try {
      // El QR anterior se descarta desde el primer momento: no debe verse una imagen vieja.
      borrarQr(pedidoId);
      let cobroId = estado.cobro?.id;
      // Si ya hay cobro, el servidor decide: reabre uno vencido o responde cuánto falta para el siguiente QR.
      if (!cobroId) {
        const abierto = await llamar<{ cobro_id: string }>("abrir-cobro", sesion.token, {
          operacion_id: opAbrir.current,
          pedido_id: pedidoId,
          vigencia_min: 6,
        });
        opAbrir.current = crypto.randomUUID();
        cobroId = abierto.cobro_id;
      }
      if (!cobroId) throw new ErrorDeApi("No se pudo abrir el cobro.");
      const data = await llamar<{ qr_imagen?: string; intento_id?: string }>("crear-intento-pago", sesion.token, {
        operacion_id: opIntento.current,
        cobro_id: cobroId,
        metodo: "qr",
      });
      opIntento.current = crypto.randomUUID();
      if (data.qr_imagen) guardarQr(pedidoId, srcQr(data.qr_imagen), data.intento_id ?? null);
      navegar(`/repartidor/cobrar/${pedidoId}`);
    } catch (fallo) {
      if (fallo instanceof ErrorDeApi && (fallo.codigo === "INTENTO_VIGENTE" || fallo.segundosRestantes)) {
        setEspera(fallo.segundosRestantes ?? 30);
      }
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo generar el QR.");
      opIntento.current = crypto.randomUUID();
      setOcupado(false);
    }
  }

  async function devolver() {
    if (!sesion) return;
    if (motivo.trim().length < 5) {
      setErrorModal("Escriba un motivo de al menos 5 caracteres.");
      return;
    }
    setOcupado(true);
    try {
      await llamar("devolver-documento", sesion.token, {
        operacion_id: opDevolver.current,
        pedido_id: pedidoId,
        motivo: motivo.trim(),
      });
      borrarQr(pedidoId);
      setCancelar(false);
      const fresco = await llamar<EstadoPedido>("estado-pedido", sesion.token, { pedido_id: pedidoId });
      setEstado(fresco);
    } catch (fallo) {
      setErrorModal(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cancelar el cobro.");
      opDevolver.current = crypto.randomUUID();
    } finally {
      setOcupado(false);
    }
  }

  const vista = estado ? vistaDe(estado) : null;
  const quedan = estado?.quedan_intentos ?? 0;
  const usados = estado?.intentos_desde_apertura ?? 0;
  const textos: Record<string, { icono: string; titulo: string; msg: string }> = {
    pendiente: {
      icono: "⏳",
      titulo: "Pendiente de pago",
      msg: "Aún no recibimos el pago. Mantenga el QR a la vista del cliente. Esta pantalla se actualiza sola.",
    },
    pagado: {
      icono: "✔",
      titulo: "Pagado",
      msg: `Recibimos ${estado ? pesos(estado.pedido.total) : ""}. Ya puede entregar las piezas al cliente.`,
    },
    entregado: {
      icono: "✔✔",
      titulo: "Entregado",
      msg: "La entrega quedó registrada con foto y firma de quien recibe.",
    },
    vencido: {
      icono: "✖",
      titulo: "QR vencido",
      msg: quedan > 0
        ? `No se recibió pago a tiempo. Puede generar otro QR: quedan ${quedan} ${quedan === 1 ? "intento" : "intentos"}.`
        : "Se usaron los 5 intentos. El cobro quedó vencido: avise a administración para resolverlo.",
    },
    cancelado: {
      icono: "⊘",
      titulo: "Cobro cancelado",
      msg: "El cobro se canceló. Si el cliente ya pagó, avise a administración.",
    },
    devuelto: {
      icono: "⊘",
      titulo: "Documento devuelto",
      msg: "El cobro se canceló y el documento quedó devuelto. Si el cliente ya pagó, avise a administración.",
    },
    porcobrar: {
      icono: "○",
      titulo: "Por cobrar",
      msg: "Esta remisión todavía no tiene un QR vigente.",
    },
  };
  const copia = vista ? textos[vista] : null;

  return (
    <CascaronRepartidor titulo="Estado del cobro" atras="/repartidor">
      <div className="pad">
        <Aviso texto={error} />
        {!estado && !error ? <p role="status">Cargando…</p> : null}
        {estado && vista && copia ? (
          <>
            <div className="card grande" style={{ borderWidth: 4, borderColor: BORDE[vista] ?? "var(--linea)" }}>
              <div className="icono" aria-hidden="true">{copia.icono}</div>
              <h2>{copia.titulo}</h2>
              <div><Insignia tipo={vista} /></div>
              <p style={{ fontSize: 18 }}>{copia.msg}</p>
              <div className="muted">Remisión {estado.pedido.folio_documento ?? estado.pedido.folio} · {estado.pedido.cliente_alias}</div>
              <div className="monto" style={{ fontSize: 34 }}>{pesos(estado.pedido.total)}</div>
            </div>
            {vista === "pagado" ? (
              <Aviso tono="ambar">
                <b>El pago no prueba la entrega.</b> Para confirmarla, tome una foto de las piezas y pida la firma de quien recibe.
              </Aviso>
            ) : null}
            {vista === "entregado" ? (
              <Aviso tono="ok">
                <b>Entrega confirmada</b> con foto y firma de quien recibe.
              </Aviso>
            ) : null}
            {vista === "pendiente" ? (
              <Boton onClick={() => navegar(`/repartidor/cobrar/${pedidoId}`)}>Volver al QR</Boton>
            ) : null}
            {vista === "pagado" ? (
              <>
                <Boton variante="entrega" onClick={() => navegar(`/repartidor/entrega/${pedidoId}`)}>📦 Marcar entrega</Boton>
                <p className="muted" style={{ textAlign: "center" }}>Se pide foto de las piezas y firma de quien recibe.</p>
              </>
            ) : null}
            {vista === "vencido" && quedan > 0 ? (
              <>
                <Vidrio>
                  <div className="fila">
                    <b>Intento {usados} de 5 vencido</b>
                    <Pips intento={usados} vencido />
                  </div>
                </Vidrio>
                <Boton ocupado={ocupado || espera > 0} onClick={() => void otroQr()}>
                  {espera > 0 ? `Espere ${espera} s` : `↻ Generar nuevo QR · intento ${Math.min(usados + 1, 5)} de 5`}
                </Boton>
                <div className="margen-top">
                  <Boton variante="peligro" onClick={() => { setErrorModal(""); setCancelar(true); }}>Cancelar cobro</Boton>
                </div>
              </>
            ) : null}
            {vista === "vencido" && quedan <= 0 ? (
              <>
                <Vidrio>
                  <div className="fila">
                    <b>Intentos: 5 de 5</b>
                    <Pips intento={5} vencido />
                  </div>
                </Vidrio>
                <Boton onClick={() => navegar("/repartidor")}>Volver a mi ruta</Boton>
              </>
            ) : null}
            {(vista === "entregado" || vista === "cancelado" || vista === "devuelto" || vista === "porcobrar") ? (
              <Boton onClick={() => navegar("/repartidor")}>Volver a mi ruta</Boton>
            ) : null}
          </>
        ) : null}
      </div>
      <Modal abierto={cancelar} titulo="¿Cancelar este cobro?" alCerrar={() => setCancelar(false)}>
        <p>La remisión queda devuelta. En ruta el servidor no cancela: devuelve el documento.</p>
        <label htmlFor="motivo-dev">Motivo (mínimo 5 caracteres)</label>
        <textarea id="motivo-dev" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
        <Aviso texto={errorModal} />
        <Boton variante="peligro" ocupado={ocupado} onClick={() => void devolver()}>Sí, cancelar cobro</Boton>
        <div className="margen-top">
          <Boton variante="secundario" onClick={() => setCancelar(false)}>No, volver</Boton>
        </div>
      </Modal>
    </CascaronRepartidor>
  );
}
