import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos, segundosEnReloj } from "../../lib/formato";

type Estado = {
  pedido: {
    id: string;
    folio: number;
    cliente_alias: string;
    total: number;
    estado: string;
    tipo_documento?: string;
    folio_documento?: string;
    orden_compra_ref?: string;
    zona?: string;
  };
  lineas: Array<{ cantidad: number; subtotal: number; producto: { nombre: string } | null }>;
  cobro: { id: string; estado: string; importe: number; vigencia_hasta: string; concepto: string } | null;
  intento: { id: string; estado: string; expira_en: string; num_ref: string } | null;
  segundos: number;
  intentos_desde_apertura: number;
  quedan_intentos: number;
};

type IntentoRespuesta = { qr_imagen?: string };

export default function Parada() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const opCobro = useRef(crypto.randomUUID());
  const opIntento = useRef(crypto.randomUUID());
  const [estado, setEstado] = useState<Estado | null>(null);
  const [qr, setQr] = useState<string | null>(sessionStorage.getItem(`poch-qr-${pedidoId}`));
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [segundosBloqueo, setSegundosBloqueo] = useState(0);
  const [motivoDev, setMotivoDev] = useState("");

  function aplicar(data: Estado) {
    setEstado(data);
    if (data.pedido.estado === "pagado") navegar(`/repartidor/entrega/${pedidoId}`);
  }

  useEffect(() => {
    if (!sesion) return;
    const cargar = () => {
      llamar<Estado>("estado-pedido", sesion.token, { pedido_id: pedidoId })
        .then(aplicar)
        .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir la parada."));
    };
    cargar();
    const reloj = setInterval(cargar, 3000);
    return () => clearInterval(reloj);
  }, [sesion, pedidoId]);

  useEffect(() => {
    if (segundosBloqueo <= 0) return;
    const t = setTimeout(() => setSegundosBloqueo((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [segundosBloqueo]);

  async function abrirYCobrar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const abierto = await llamar<{ cobro_id: string }>("abrir-cobro", sesion.token, {
        operacion_id: opCobro.current,
        pedido_id: pedidoId,
        vigencia_min: 15,
      });
      opCobro.current = crypto.randomUUID();
      await generarQr(abierto.cobro_id);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir el cobro.");
    } finally {
      setOcupado(false);
    }
  }

  async function generarQr(cobroId?: string) {
    if (!sesion) return;
    const idCobro = cobroId ?? estado?.cobro?.id;
    if (!idCobro) {
      await abrirYCobrar();
      return;
    }
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<IntentoRespuesta>("crear-intento-pago", sesion.token, {
        operacion_id: opIntento.current,
        cobro_id: idCobro,
        metodo: "qr",
      });
      opIntento.current = crypto.randomUUID();
      if (data.qr_imagen) {
        setQr(data.qr_imagen);
        sessionStorage.setItem(`poch-qr-${pedidoId}`, data.qr_imagen);
      }
      const fresco = await llamar<Estado>("estado-pedido", sesion.token, { pedido_id: pedidoId });
      aplicar(fresco);
    } catch (fallo) {
      if (fallo instanceof ErrorDeApi && (fallo.codigo === "INTENTO_VIGENTE" || fallo.segundosRestantes)) {
        setSegundosBloqueo(fallo.segundosRestantes ?? 30);
      }
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo generar el QR.");
      opIntento.current = crypto.randomUUID();
    } finally {
      setOcupado(false);
    }
  }

  async function devolver() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      await llamar("devolver-documento", sesion.token, {
        operacion_id: crypto.randomUUID(),
        pedido_id: pedidoId,
        motivo: motivoDev,
      });
      navegar("/repartidor");
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo devolver el documento.");
    } finally {
      setOcupado(false);
    }
  }

  const cobroVigente = estado?.cobro && ["emitido", "en_proceso"].includes(estado.cobro.estado)
    && new Date(estado.cobro.vigencia_hasta).getTime() > Date.now();
  const intentoVivo = estado?.intento && estado.intento.estado === "creado"
    && new Date(estado.intento.expira_en).getTime() + 30_000 > Date.now();
  const segundosQr = estado?.intento && estado.intento.estado === "creado"
    ? Math.max(0, Math.floor((new Date(estado.intento.expira_en).getTime() - Date.now()) / 1000))
    : 0;
  const qrVencido = Boolean((qr || estado?.intento) && segundosQr <= 0 && estado?.cobro && cobroVigente);
  const usados = estado?.intentos_desde_apertura ?? 0;
  const quedan = estado?.quedan_intentos ?? Math.max(0, 5 - usados);

  return (
    <Marco titulo="Parada" enlaces={[{ a: "/repartidor", texto: "Mi ruta" }, { a: "/repartidor/historial", texto: "Historial" }]}>
      <Aviso texto={error} />
      <p className="text-sm text-marino/70">{estado?.pedido.zona ?? "Sin zona"}</p>
      <h2 className="text-2xl font-semibold">{estado?.pedido.cliente_alias}</h2>
      <p className="mt-1">
        {etiqueta(estado?.pedido.tipo_documento)} {estado?.pedido.folio_documento}
        {estado?.pedido.orden_compra_ref ? ` · OC ${estado.pedido.orden_compra_ref}` : ""}
      </p>
      <p className="mt-2 text-3xl font-semibold">{estado ? pesos(estado.pedido.total) : ""}</p>
      <ul className="mt-4 space-y-1">
        {(estado?.lineas ?? []).map((linea, i) => (
          <li key={i}>{linea.cantidad} × {linea.producto?.nombre ?? "Pieza"} · {pesos(linea.subtotal)}</li>
        ))}
      </ul>

      {!qr && !intentoVivo && !qrVencido && (
        <div className="mt-6">
          <Boton onClick={() => void (estado?.cobro && cobroVigente ? generarQr() : abrirYCobrar())} ocupado={ocupado}>
            {estado?.cobro && !cobroVigente ? "Volver a cobrar" : "Cobrar"}
          </Boton>
        </div>
      )}

      {(qr || intentoVivo) && segundosQr > 0 && (
        <section className="mt-6 text-center">
          {qr && <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="Código QR de cobro" className="mx-auto w-full max-w-xs" />}
          <p className="mt-3 text-lg">Vigencia del QR: {segundosEnReloj(segundosQr)}</p>
          <p className="text-sm text-marino/70">{estado?.cobro?.concepto}</p>
        </section>
      )}

      {qrVencido && (
        <section className="mt-6 space-y-4">
          <p className="text-lg font-semibold">El QR venció</p>
          <div className="flex justify-center gap-2" aria-label={`Intentos usados ${usados} de 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < usados ? "bg-jade" : "bg-linea"}`} />
            ))}
          </div>
          <p className="text-center text-sm">Quedan {quedan} intentos</p>
          {quedan > 0 ? (
            <Boton onClick={() => void generarQr()} ocupado={ocupado || segundosBloqueo > 0}>
              {segundosBloqueo > 0
                ? `Espere ${segundosBloqueo} s`
                : `Generar otro QR · intento ${Math.min(usados + 1, 5)} de 5`}
            </Boton>
          ) : (
            <p className="rounded-2xl bg-ambar-fondo px-4 py-3 text-ambar">Pida apoyo al administrador o devuelva el documento.</p>
          )}
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-linea bg-white p-4">
        <h3 className="font-semibold">Devolver documento</h3>
        <p className="text-sm text-marino/70">En ruta no se cancela: se devuelve con motivo.</p>
        <label className="mt-2 block text-sm" htmlFor="motivo-dev">
          Motivo
          <textarea id="motivo-dev" value={motivoDev} onChange={(e) => setMotivoDev(e.target.value)} className="mt-1 min-h-20 w-full rounded-2xl border border-linea px-3 py-2" />
        </label>
        <div className="mt-3">
          <Boton secundario onClick={() => void devolver()} ocupado={ocupado}>Devolver documento</Boton>
        </div>
      </section>
      <p className="mt-4">
        <Link className="text-jade" to="/repartidor">Volver a mi ruta</Link>
      </p>
    </Marco>
  );
}
