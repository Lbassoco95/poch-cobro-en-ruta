import { useState } from "react";
import { Boton } from "./Boton";

// Recibo al cliente por enlace. No se envía nada solo y no se guarda teléfono ni correo del cliente:
// el repartidor decide por dónde compartir el enlace público /c/:clave.
export function ReciboCliente({ clave, folio }: { clave: string | null | undefined; folio: string | number | null | undefined }) {
  const [aviso, setAviso] = useState("");
  if (!clave) return null;

  const enlace = `${window.location.origin}/c/${clave}`;
  const texto = `Comprobante de su pago (remisión ${folio ?? ""}). Es informativo y no tiene validez fiscal: ${enlace}`;
  const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setAviso("Enlace copiado.");
    } catch {
      setAviso("No se pudo copiar. Mantenga presionado el enlace para copiarlo.");
    }
  }

  async function compartir() {
    try {
      await navigator.share({ title: "Comprobante de pago", text: "Comprobante informativo de su pago.", url: enlace });
    } catch {
      // El usuario canceló o el sistema no lo permitió: no es un error.
    }
  }

  return (
    <section className="margen-top" aria-label="Enviar comprobante al cliente">
      <h3>Comprobante para el cliente</h3>
      <p className="muted">Solo se comparte un enlace. Poch no guarda el teléfono ni el correo del cliente.</p>
      <Boton variante="secundario" onClick={() => void copiar()}>🔗 Copiar enlace del comprobante</Boton>
      {puedeCompartir ? (
        <div className="margen-top">
          <Boton variante="secundario" onClick={() => void compartir()}>📤 Compartir</Boton>
        </div>
      ) : null}
      <div className="margen-top">
        <a className="btn sec" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">
          💬 Enviar por WhatsApp
        </a>
      </div>
      <div className="margen-top">
        <a
          className="btn sec"
          href={`mailto:?subject=${encodeURIComponent("Comprobante de su pago")}&body=${encodeURIComponent(texto)}`}
        >
          ✉️ Enviar por correo
        </a>
      </div>
      {aviso ? <p className="muted" role="status">{aviso}</p> : null}
      <p className="muted" style={{ wordBreak: "break-all" }}>{enlace}</p>
    </section>
  );
}
