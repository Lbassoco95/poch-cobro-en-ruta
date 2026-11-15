// Muestra tal cual la imagen PNG que devuelve pey (data:image/png;base64). No se regenera desde qr_cadena.
export function Qr({ src, cargando = false }: { src: string | null; cargando?: boolean }) {
  return (
    <div className="qrbox">
      {src ? (
        <img src={src} alt="Código QR de CoDi para este cobro" width={280} height={280} />
      ) : (
        <p>
          {cargando
            ? "Cargando el cobro…"
            : "No hay un QR vigente en este celular. Si el anterior venció, vuelva al estado del cobro y genere otro."}
        </p>
      )}
    </div>
  );
}
