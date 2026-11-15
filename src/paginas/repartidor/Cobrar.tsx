import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { Modal } from "../../componentes/Modal";
import { Pips } from "../../componentes/Pips";
import { Qr } from "../../componentes/Qr";
import { Vidrio } from "../../componentes/Vidrio";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { borrarQr, guardarQr, leerQr, pesos, segundosEnReloj, srcQr } from "../../lib/formato";
import type { EstadoPedido } from "../../lib/tipos";

export default function Cobrar() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const opAviso = useRef(crypto.randomUUID());
  const opDevolver = useRef(crypto.randomUUID());
  const [estado, setEstado] = useState<EstadoPedido | null>(null);
  const [local, setLocal] = useState<{ intentoId: string | null; src: string } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [celular, setCelular] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorModal, setErrorModal] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [avisoEnviado, setAvisoEnviado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<EstadoPedido>("estado-pedido", sesion.token, { pedido_id: pedidoId })
        .then((data) => {
          if (!activo) return;
          setEstado(data);
          setSegundos(data.segundos);
          if (data.pedido.estado === "pagado" || data.pedido.estado === "entregado") {
            borrarQr(pedidoId);
            navegar(`/repartidor/estado/${pedidoId}`, { replace: true });
          }
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
  }, [sesion, pedidoId, navegar]);

  useEffect(() => {
    const reloj = setInterval(() => setSegundos((actual) => Math.max(0, actual - 1)), 1000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    if (estado && segundos === 0 && estado.intento && estado.pedido.estado !== "pagado") {
      navegar(`/repartidor/estado/${pedidoId}`, { replace: true });
    }
  }, [segundos, estado, navegar, pedidoId]);

  async function enviarAviso() {
    if (!sesion || !estado?.cobro) return;
    if (!/^[0-9]{10}$/.test(celular)) {
      setErrorModal("Escriba exactamente 10 dígitos, sin espacios.");
      return;
    }
    setOcupado(true);
    setErrorModal("");
    try {
      const data = await llamar<{ ya_enviado?: boolean; qr_imagen?: string; intento_id?: string }>("crear-intento-pago", sesion.token, {
        operacion_id: opAviso.current,
        cobro_id: estado.cobro.id,
        metodo: "push",
        celular,
      });
      opAviso.current = crypto.randomUUID();
      if (data.qr_imagen) {
        const src = srcQr(data.qr_imagen);
        guardarQr(pedidoId, src, data.intento_id ?? null);
        setLocal({ intentoId: data.intento_id ?? null, src });
      }
      setCelular("");
      setAviso(false);
      setAvisoEnviado(Boolean(data.ya_enviado) || true);
    } catch (fallo) {
      setErrorModal(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo enviar el aviso.");
      opAviso.current = crypto.randomUUID();
    } finally {
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
      navegar(`/repartidor/estado/${pedidoId}`, { replace: true });
    } catch (fallo) {
      setErrorModal(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cancelar el cobro.");
      opDevolver.current = crypto.randomUUID();
      setOcupado(false);
    }
  }

  const pedido = estado?.pedido;
  const intento = Math.max(1, estado?.intentos_desde_apertura || 1);
  const poco = segundos <= 60;
  // Solo se muestra el QR del intento vivo. Un QR de otro intento o ya vencido nunca se dibuja.
  const intentoVivo = estado?.intento && estado.intento.estado === "creado" && segundos > 0 ? estado.intento.id : null;
  const imagen = intentoVivo
    ? (local && local.intentoId === intentoVivo ? local.src : leerQr(pedidoId, intentoVivo))
    : null;

  return (
    <CascaronRepartidor titulo="Cobrar" atras="/repartidor">
      <div className="pad">
        <Aviso texto={error} />
        {avisoEnviado ? <Aviso tono="ok">Aviso enviado. El número no se guardó. El QR sigue vigente.</Aviso> : null}
        <div className="grande" style={{ padding: "0 0 var(--e3)" }}>
          <div className="muted">Remisión {pedido?.folio_documento ?? pedido?.folio ?? "…"} · {pedido?.cliente_alias}</div>
          <div className="monto" style={{ fontSize: 48 }}>{pedido ? pesos(estado?.cobro?.importe ?? pedido.total) : "…"}</div>
        </div>
        <Qr key={intentoVivo ?? "sin-intento"} src={imagen} cargando={!estado} />
        <p className="muted" style={{ textAlign: "center" }}>Pida al cliente que escanee el código con la app de su banco.</p>
        <div className={`cuenta${poco ? " poco" : ""}`} aria-live="off">{segundosEnReloj(segundos)}</div>
        <div className={`barra${poco ? " poco" : ""}`} style={{ margin: "6px 0 var(--e3)" }}>
          <i style={{ width: `${Math.min(100, (segundos / 360) * 100)}%` }} />
        </div>
        <div className="fila" style={{ marginBottom: "var(--e3)" }}>
          <Insignia tipo="pendiente" />
          <Insignia tipo="aviso">Intento {intento} de 5</Insignia>
        </div>
        <div className="fila" style={{ marginBottom: "var(--e3)" }}>
          <span className="muted">Si el QR vence, podrá generar otro.</span>
          <Pips intento={intento} />
        </div>
        <Vidrio>
          <div className="fila">
            <span className="muted">Folio de la remisión</span>
            <b>{pedido?.folio_documento ?? pedido?.folio ?? "—"}</b>
          </div>
        </Vidrio>
        <Boton variante="secundario" onClick={() => { setErrorModal(""); setAviso(true); }}>
          📲 Enviar aviso al celular del cliente
        </Boton>
        <div className="margen-top">
          <Boton variante="peligro" onClick={() => { setErrorModal(""); setCancelar(true); }}>Cancelar cobro</Boton>
        </div>
      </div>
      <Modal abierto={aviso} titulo="Aviso al celular del cliente" alCerrar={() => setAviso(false)}>
        <p className="muted">Escriba los 10 dígitos. Solo se usa para enviar el aviso; no se guarda.</p>
        <label htmlFor="tel">Celular (10 dígitos)</label>
        <input
          id="tel"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="10 dígitos"
          value={celular}
          onChange={(evento) => setCelular(evento.target.value.replace(/\D/g, "").slice(0, 10))}
        />
        <Aviso texto={errorModal} />
        <p className="muted">Si el QR sigue vigente, el servidor puede pedir que espere a que venza.</p>
        <Boton ocupado={ocupado} onClick={() => void enviarAviso()}>Enviar aviso</Boton>
        <div className="margen-top">
          <Boton variante="secundario" onClick={() => setAviso(false)}>Cerrar</Boton>
        </div>
      </Modal>
      <Modal abierto={cancelar} titulo="¿Cancelar este cobro?" alCerrar={() => setCancelar(false)}>
        <p>La remisión queda devuelta y se avisa a administración. Si el cliente ya pagó, avise a administración.</p>
        <label htmlFor="motivo-cancelar">Motivo (mínimo 5 caracteres)</label>
        <textarea id="motivo-cancelar" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
        <Aviso texto={errorModal} />
        <Boton variante="peligro" ocupado={ocupado} onClick={() => void devolver()}>Sí, cancelar cobro</Boton>
        <div className="margen-top">
          <Boton variante="secundario" onClick={() => setCancelar(false)}>No, volver</Boton>
        </div>
      </Modal>
    </CascaronRepartidor>
  );
}
