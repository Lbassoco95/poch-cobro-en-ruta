import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos } from "../../lib/formato";

type Pago = {
  id: string;
  monto: number;
  resultado: string;
  resolucion: string | null;
  folio: number | null;
  pedido_id: string | null;
  repartidor: string | null;
  pagador_clabe_ultimos4: string | null;
  clave_rastreo: string | null;
};

export default function Pagos() {
  const { sesion } = useSesion();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState("");
  const operaciones = useRef<Record<string, string>>({});

  function cargar() {
    if (!sesion) return;
    llamar<{ discrepancias: Pago[] }>("tablero", sesion.token)
      .then((data) => setPagos(data.discrepancias))
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudieron cargar los pagos."));
  }

  useEffect(() => {
    cargar();
    const reloj = setInterval(cargar, 5000);
    return () => clearInterval(reloj);
  }, [sesion]);

  async function resolver(pago: Pago, accion: "aceptar" | "devolver" | "devuelto") {
    if (!sesion) return;
    const nota = (notas[pago.id] ?? "").trim();
    if (nota.length < 5) {
      setError("Escriba una nota de al menos 5 caracteres.");
      return;
    }
    operaciones.current[`${pago.id}:${accion}`] ??= crypto.randomUUID();
    setOcupado(pago.id);
    setError("");
    try {
      await llamar("resolver-pago", sesion.token, {
        operacion_id: operaciones.current[`${pago.id}:${accion}`],
        pago_id: pago.id,
        accion,
        nota,
      });
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo resolver el pago.");
    } finally {
      setOcupado("");
    }
  }

  const pendientes = pagos.filter((pago) => !pago.resolucion);

  return (
    <Marco titulo="Pagos por resolver" ancho="max-w-4xl" enlaces={[{ a: "/admin", texto: "Tablero" }]}>
      <Aviso texto={error} />
      {pendientes.length === 0 && <p className="mt-4 text-lg">No hay pagos pendientes de resolver.</p>}
      <ul className="mt-4 space-y-4">
        {pendientes.map((pago) => (
          <li key={pago.id} className="rounded-2xl border border-linea bg-white p-4">
            <p className="text-lg font-semibold">{etiqueta(pago.resultado)} · {pesos(pago.monto)}</p>
            <p className="text-sm text-marino/70">
              Folio {pago.folio ?? "sin folio"} · {pago.repartidor ?? "Sin repartidor"} · CLABE ····{pago.pagador_clabe_ultimos4 ?? "----"} · {pago.clave_rastreo ?? "sin clave"}
            </p>
            {pago.pedido_id && (
              <Link className="text-sm font-medium text-jade" to={`/admin/pedido/${pago.pedido_id}`}>Ver pedido</Link>
            )}
            <label className="mt-3 block text-sm font-medium" htmlFor={`nota-${pago.id}`}>
              Nota
              <textarea
                id={`nota-${pago.id}`}
                value={notas[pago.id] ?? ""}
                onChange={(evento) => setNotas((actual) => ({ ...actual, [pago.id]: evento.target.value }))}
                className="mt-1 min-h-20 w-full rounded-2xl border border-linea px-3 py-2"
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {pago.resultado === "fuera_de_vigencia" && (
                <Boton onClick={() => void resolver(pago, "aceptar")} ocupado={ocupado === pago.id}>Aceptar</Boton>
              )}
              <Boton secundario onClick={() => void resolver(pago, "devolver")} ocupado={ocupado === pago.id}>Marcar devolución</Boton>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Ya resueltos</h2>
      <ul className="mt-2 space-y-2">
        {pagos.filter((pago) => pago.resolucion).map((pago) => (
          <li key={pago.id} className="rounded-2xl border border-linea bg-white p-3 text-sm">
            {etiqueta(pago.resultado)} · {etiqueta(pago.resolucion)} · {pesos(pago.monto)}
            {pago.resolucion === "devolucion_pendiente" && (
              <div className="mt-2 max-w-md space-y-2">
                <label className="block text-sm font-medium" htmlFor={`nota-devuelto-${pago.id}`}>
                  Nota de la devolución
                  <input
                    id={`nota-devuelto-${pago.id}`}
                    value={notas[pago.id] ?? ""}
                    onChange={(evento) => setNotas((actual) => ({ ...actual, [pago.id]: evento.target.value }))}
                    className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3"
                  />
                </label>
                <Boton onClick={() => void resolver(pago, "devuelto")} ocupado={ocupado === pago.id}>Marcar devuelto</Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Marco>
  );
}
