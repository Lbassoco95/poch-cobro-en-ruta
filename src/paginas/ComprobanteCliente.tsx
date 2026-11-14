import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Aviso } from "../componentes/Aviso";
import { Pie } from "../componentes/Pie";
import { Vidrio } from "../componentes/Vidrio";
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
  entrega: { fecha: string; recibe: string; leyenda: string } | null;
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
      setError("Faltan las variables de acceso para abrir el comprobante.");
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
    <div className="stage">
      <main className="ingreso">
        <p className="muted">Poch</p>
        <h1>Comprobante de pago</h1>
        <p className="muted">Información del cobro. No incluye datos del pagador ni del repartidor.</p>
        <Aviso texto={error} />
        {datos ? (
          <Vidrio>
            <p className="muted">Empresa que cobró</p>
            <p>{datos.empresa}</p>
            <p className="muted margen-top">Cuenta destino</p>
            <p>····{datos.cuenta_destino_ultimos4 ?? "----"}</p>
            <p className="muted margen-top">Folio</p>
            <p className="monto" style={{ fontSize: 28 }}>{datos.folio ?? "—"}</p>
            <p className="muted margen-top">Monto</p>
            <p className="monto" style={{ fontSize: 34 }}>{pesos(datos.monto)}</p>
            <p className="muted margen-top">Fecha y hora</p>
            <p>{fechaHora(datos.fecha)}</p>
            <p className="muted margen-top">Número de referencia</p>
            <p>{datos.num_ref ?? "—"}</p>
            <p className="muted margen-top">Clave de rastreo</p>
            <p className="nombre">{datos.clave_rastreo ?? "—"}</p>
            <p className="muted margen-top">Concepto</p>
            <p>{datos.concepto}</p>
            <p className="muted margen-top">Piezas</p>
            <ul>
              {datos.piezas.map((pieza, indice) => (
                <li key={`${pieza.nombre}-${indice}`}>{pieza.cantidad} × {pieza.nombre} · {pesos(pieza.subtotal)}</li>
              ))}
            </ul>
            {datos.entrega ? (
              <>
                <p className="muted margen-top">Entrega</p>
                <p>{fechaHora(datos.entrega.fecha)}</p>
                <p>Recibió: {datos.entrega.recibe}</p>
                <p className="muted">{datos.entrega.leyenda}</p>
              </>
            ) : null}
            <Aviso tono="info">{datos.aviso}</Aviso>
          </Vidrio>
        ) : null}
        <Pie />
      </main>
    </div>
  );
}
