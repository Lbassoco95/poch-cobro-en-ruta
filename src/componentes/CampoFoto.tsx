export function CampoFoto({
  vista,
  alArchivo,
}: {
  vista: string | null;
  alArchivo: (archivo: File | null) => void;
}) {
  return (
    <div className="card">
      {vista ? (
        <img className="ev" src={vista} alt="Foto de la entrega" />
      ) : (
        <div className="vacio">Aún no hay foto</div>
      )}
      <label className="btn sec" htmlFor="foto" style={{ marginTop: 12 }}>
        {vista ? "📷 Cambiar foto" : "📷 Tomar foto"}
      </label>
      <input
        id="foto"
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(evento) => alArchivo(evento.target.files?.[0] ?? null)}
      />
    </div>
  );
}
