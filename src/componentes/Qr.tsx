export function Qr({ src }: { src: string | null }) {
  return (
    <div className="qrbox">
      {src ? (
        <img src={src} alt="Código QR de CoDi para este cobro" />
      ) : (
        <p>El código todavía no está en este celular. Si el intento sigue vigente, espere a que venza y genere otro.</p>
      )}
    </div>
  );
}
