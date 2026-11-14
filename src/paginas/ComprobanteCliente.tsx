import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Pie } from "../componentes/Pie";
import { fechaHora, pesos } from "../lib/formato";

type Comprobante = {
  empresa: string;
  cuenta_destino_ultimos4: string | null;
  folio: number | null;
  concepto: string;
  monto: number;
  fecha: string | null;
  num_ref: string | null;
  clave_rastreo: string | null;
  piezas: Array<{ nombre: string; cantidad: number; subtotal: number }>;
  aviso: string;
};

export default function ComprobanteCliente() {
  const { clave = "" } = useParams();
  const [datos, setDatos] = useState<Comprobante | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const llave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !llave) {
      setError("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para abrir el comprobante.");
      return;
    }
    fetch(`${url}/functions/v1/comprobante`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: llave,
        authorization: `Bearer ${llave}`,
      },
      body: JSON.stringify({ clave }),
    })
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(typeof cuerpo.error === "string" ? cuerpo.error : "No se encontró el comprobante.");
        setDatos(cuerpo as Comprobante);
      })
      .catch((fallo: unknown) => setError(fallo instanceof Error ? fallo.message : "No se encontró el comprobante."));
  }, [clave]);

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-gradient-to-b from-papel to-white px-4 py-10 text-marino">
      <p className="text-sm font-semibold tracking-wide text-jade">Poch</p>
      <h1 className="mt-2 text-3xl font-semibold">Comprobante de pago</h1>
      <p className="mt-2 text-marino/80">Información del cobro. No incluye datos del pagador ni del repartidor.</p>
      {error && <p role="alert" className="mt-6 rounded-2xl bg-ambar-fondo px-4 py-3 text-ambar">{error}</p>}
      {datos && (
        <section className="mt-8 space-y-5">
          <div>
            <p className="text-sm text-marino/70">Empresa que cobró</p>
            <p className="text-xl font-semibold">{datos.empresa}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Cuenta destino</p>
            <p className="text-lg">····{datos.cuenta_destino_ultimos4 ?? "----"}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Folio</p>
            <p className="text-2xl font-semibold">{datos.folio ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Monto</p>
            <p className="text-3xl font-semibold text-jade">{pesos(datos.monto)}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Fecha y hora</p>
            <p className="text-lg">{fechaHora(datos.fecha)}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Número de referencia</p>
            <p className="text-lg">{datos.num_ref ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Clave de rastreo</p>
            <p className="break-all text-lg">{datos.clave_rastreo ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-marino/70">Piezas</p>
            <ul className="mt-2 space-y-1">
              {datos.piezas.map((pieza, indice) => (
                <li key={`${pieza.nombre}-${indice}`}>
                  {pieza.cantidad} × {pieza.nombre} · {pesos(pieza.subtotal)}
                </li>
              ))}
            </ul>
          </div>
          <p className="rounded-2xl border border-linea bg-white px-4 py-3 text-sm" role="note">
            {datos.aviso}
          </p>
        </section>
      )}
      <div className="mt-10">
        <Pie />
      </div>
    </main>
  );
}
