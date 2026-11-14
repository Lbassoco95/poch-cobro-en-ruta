import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Aviso, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, fechaHora, pesos } from "../../lib/formato";

type Respuesta = {
  periodo: string;
  total_cobrado: number;
  paradas: Array<{
    id: string;
    cliente: string;
    zona: string | null;
    total: number;
    estado: string;
    actualizado_en: string;
    folio_documento: string | null;
    orden_compra: string | null;
    comprobante_clave: string | null;
  }>;
};

export default function Historial() {
  const { sesion } = useSesion();
  const [periodo, setPeriodo] = useState<"hoy" | "semana">("hoy");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sesion) return;
    llamar<Respuesta>("mi-historial", sesion.token, { periodo })
      .then(setDatos)
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar el historial."));
  }, [sesion, periodo]);

  return (
    <Marco titulo="Historial" enlaces={[{ a: "/repartidor", texto: "Mi ruta" }]}>
      <Aviso texto={error} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setPeriodo("hoy")} className={`min-h-12 flex-1 rounded-2xl border px-3 font-medium ${periodo === "hoy" ? "border-jade bg-jade text-white" : "border-linea bg-white"}`}>Hoy</button>
        <button type="button" onClick={() => setPeriodo("semana")} className={`min-h-12 flex-1 rounded-2xl border px-3 font-medium ${periodo === "semana" ? "border-jade bg-jade text-white" : "border-linea bg-white"}`}>Esta semana</button>
      </div>
      <p className="mt-4 text-lg">Total cobrado: <strong>{pesos(datos?.total_cobrado ?? 0)}</strong></p>
      <ul className="mt-4 space-y-3">
        {(datos?.paradas ?? []).map((parada) => (
          <li key={parada.id} className="rounded-2xl border border-linea bg-white p-4">
            <p className="text-sm text-marino/70">{etiqueta(parada.estado)} · {fechaHora(parada.actualizado_en)}</p>
            <p className="text-lg font-semibold">{parada.cliente}</p>
            <p className="text-sm">{parada.zona ?? "Sin zona"} · {parada.folio_documento}{parada.orden_compra ? ` · OC ${parada.orden_compra}` : ""}</p>
            <p className="mt-1 text-xl font-semibold">{pesos(parada.total)}</p>
            {parada.comprobante_clave && (
              <Link className="mt-2 inline-block text-sm font-medium text-jade" to={`/c/${parada.comprobante_clave}`}>Ver comprobante</Link>
            )}
          </li>
        ))}
      </ul>
    </Marco>
  );
}
