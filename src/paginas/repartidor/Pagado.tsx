import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Aviso } from "../../componentes/Marco";
import { Pie } from "../../componentes/Pie";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { fechaHora, pesos } from "../../lib/formato";

type Estado = {
  pedido: { folio: number; estado: string; cliente_alias: string };
  cobro: { concepto: string; importe: number; pagado_en: string | null } | null;
  pago: {
    monto: number | null;
    clave_rastreo: string | null;
    pagado_en: string | null;
    pagador_banco: string | null;
    pagador_clabe_ultimos4: string | null;
  } | null;
  comprobante_clave: string | null;
};

export default function Pagado() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const operacion = useRef(crypto.randomUUID());
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    llamar<Estado>("estado-pedido", sesion.token, { pedido_id: pedidoId })
      .then(setEstado)
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir el comprobante."));
  }, [sesion, pedidoId]);

  async function entregar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      await llamar("marcar-entregado", sesion.token, { operacion_id: operacion.current, pedido_id: pedidoId });
      navegar("/repartidor");
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo marcar la entrega.");
      setOcupado(false);
    }
  }

  const entregado = estado?.pedido.estado === "entregado";
  const enlace = estado?.comprobante_clave ? `/c/${estado.comprobante_clave}` : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col bg-jade px-4 py-8 text-white">
      <p className="text-sm font-semibold">Poch</p>
      <h1 className="mt-2 text-4xl font-semibold">{entregado ? "Entregado" : "Pagado"}</h1>
      <p className="mt-2 text-lg">Muestre esta pantalla al cliente.</p>
      <dl className="mt-8 space-y-4 text-lg">
        <div>
          <dt className="text-sm text-white/80">Folio</dt>
          <dd className="text-3xl font-semibold">{estado?.pedido.folio ?? "…"}</dd>
        </div>
        <div>
          <dt className="text-sm text-white/80">Importe</dt>
          <dd className="text-3xl font-semibold">{pesos(estado?.pago?.monto ?? estado?.cobro?.importe ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-sm text-white/80">Fecha y hora</dt>
          <dd>{fechaHora(estado?.pago?.pagado_en ?? estado?.cobro?.pagado_en)}</dd>
        </div>
        <div>
          <dt className="text-sm text-white/80">Banco del pagador</dt>
          <dd>{estado?.pago?.pagador_banco ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sm text-white/80">CLABE del pagador</dt>
          <dd>····{estado?.pago?.pagador_clabe_ultimos4 ?? "----"}</dd>
        </div>
        <div>
          <dt className="text-sm text-white/80">Clave de rastreo</dt>
          <dd>{estado?.pago?.clave_rastreo ?? "En cuanto llegue la confirmación"}</dd>
        </div>
      </dl>
      {enlace && (
        <p className="mt-6 text-sm">
          Comprobante para el cliente:{" "}
          <Link className="underline" to={enlace}>{window.location.origin}{enlace}</Link>
        </p>
      )}
      <div className="mt-8 space-y-3">
        {error && <p role="alert" className="rounded-2xl bg-white px-4 py-3 text-peligro">{error}</p>}
        {!entregado && (
          <button type="button" onClick={() => void entregar()} disabled={ocupado} className="min-h-14 w-full rounded-2xl bg-white text-lg font-semibold text-jade-oscuro">
            {ocupado ? "Espere…" : "Marcar entregado"}
          </button>
        )}
        <button type="button" onClick={() => navegar("/repartidor")} className="min-h-14 w-full rounded-2xl border border-white text-lg font-semibold">
          Volver a los pedidos
        </button>
      </div>
      <p className="mt-8 text-sm text-white/90">Demostración con datos ficticios. Sin validez fiscal.</p>
      <div className="sr-only">
        <Aviso texto="" />
        <Pie />
      </div>
    </main>
  );
}
