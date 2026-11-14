import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos, segundosEnReloj } from "../../lib/formato";

type Estado = {
  pedido: { id: string; folio: number; estado: string; cliente_alias: string; total: number };
  cobro: { id: string; concepto: string; importe: number; estado: string } | null;
  intento: { id: string; estado: string; expira_en: string; metodo: string } | null;
  segundos: number;
};

type IntentoCreado = {
  intento_id?: string;
  qr_imagen?: string | null;
  qr_cadena?: string;
  ya_enviado?: boolean;
  pendiente_de_imagen?: boolean;
  error?: string;
};

export default function Cobrar() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const operacionCobro = useRef(crypto.randomUUID());
  const operacionCancelar = useRef(crypto.randomUUID());
  const [estado, setEstado] = useState<Estado | null>(null);
  const [imagen, setImagen] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [celular, setCelular] = useState("");
  const [mostrarCelular, setMostrarCelular] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [avisoEnviado, setAvisoEnviado] = useState(false);

  useEffect(() => {
    const guardada = sessionStorage.getItem(`poch-qr-${pedidoId}`);
    if (guardada) setImagen(guardada);
  }, [pedidoId]);

  useEffect(() => {
    if (!sesion) return;
    let activo = true;
    const cargar = () => {
      llamar<Estado>("estado-pedido", sesion.token, { pedido_id: pedidoId })
        .then((data) => {
          if (!activo) return;
          setEstado(data);
          setSegundos(data.segundos);
          if (data.pedido.estado === "pagado" || data.pedido.estado === "entregado") {
            navegar(`/repartidor/pagado/${pedidoId}`, { replace: true });
          }
        })
        .catch((fallo: unknown) => {
          if (activo) setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo consultar el pedido.");
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

  async function generar(metodo: "qr" | "push") {
    if (!sesion || !estado?.cobro) return;
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<IntentoCreado>("crear-intento-pago", sesion.token, {
        operacion_id: operacionCobro.current,
        cobro_id: estado.cobro.id,
        metodo,
        celular: metodo === "push" ? celular : undefined,
      });
      if (data.qr_imagen) {
        setImagen(data.qr_imagen);
        sessionStorage.setItem(`poch-qr-${pedidoId}`, data.qr_imagen);
      }
      if (data.ya_enviado) setAvisoEnviado(true);
      if (data.pendiente_de_imagen) setError("El código ya se generó. Si no lo ve, genere otro.");
      operacionCobro.current = crypto.randomUUID();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo generar el cobro.");
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (!sesion) return;
    setOcupado(true);
    try {
      await llamar("cancelar-pedido", sesion.token, { operacion_id: operacionCancelar.current, pedido_id: pedidoId });
      navegar("/repartidor");
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cancelar.");
      setOcupado(false);
    }
  }

  const qrVencido = Boolean(imagen) && segundos === 0;

  return (
    <Marco titulo="Cobrar" enlaces={[{ a: "/repartidor", texto: "Pedidos" }]}>
      <p className="text-sm text-marino/70">Folio {estado?.pedido.folio} · {estado?.pedido.cliente_alias}</p>
      <p className="mt-2 text-center text-4xl font-semibold" aria-live="polite">{estado ? pesos(estado.cobro?.importe ?? estado.pedido.total) : "…"}</p>
      <p className="mt-1 text-center text-lg">{estado?.cobro?.concepto}</p>
      <p className="mt-2 text-center text-sm font-medium">{etiqueta(estado?.pedido.estado)}</p>
      {imagen && (
        <figure className="mx-auto mt-4 max-w-xs rounded-3xl bg-white p-4">
          <img src={`data:image/png;base64,${imagen}`} alt="Código QR de CoDi para este cobro" className="w-full" />
          <figcaption className="mt-2 text-center text-2xl font-semibold" aria-live="polite">
            {qrVencido ? "El código venció" : segundosEnReloj(segundos)}
          </figcaption>
        </figure>
      )}
      <div className="mt-4 space-y-3">
        <Aviso texto={error} />
        {avisoEnviado && <p role="status">El aviso se envió al celular. El número no se guardó.</p>}
        {(!imagen || qrVencido) && (
          <Boton onClick={() => void generar("qr")} ocupado={ocupado}>
            {imagen ? "Generar otro código" : "Mostrar código QR"}
          </Boton>
        )}
        <button type="button" className="text-sm font-medium text-jade" onClick={() => setMostrarCelular((actual) => !actual)}>
          Enviar aviso al celular del cliente
        </button>
        {mostrarCelular && (
          <div className="space-y-3 rounded-2xl border border-linea bg-white p-4">
            <p className="text-sm leading-6">El número solo se usa para enviar el aviso. No se guarda.</p>
            <label className="block text-sm font-medium" htmlFor="celular">
              Celular a 10 dígitos
              <input
                id="celular"
                inputMode="numeric"
                autoComplete="off"
                value={celular}
                onChange={(evento) => setCelular(evento.target.value.replace(/\D/g, "").slice(0, 10))}
                className="mt-1 min-h-14 w-full rounded-2xl border border-linea px-4 text-lg"
              />
            </label>
            <Boton secundario onClick={() => void generar("push")} ocupado={ocupado || celular.length !== 10}>
              Enviar aviso
            </Boton>
          </div>
        )}
        {estado?.pedido.estado === "por_cobrar" && (
          <Boton secundario onClick={() => void cancelar()} ocupado={ocupado}>
            Cancelar pedido
          </Boton>
        )}
        <Link to="/repartidor" className="block text-center text-sm">
          Volver a los pedidos
        </Link>
      </div>
    </Marco>
  );
}
