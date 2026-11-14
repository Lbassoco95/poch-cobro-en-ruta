export function Pips({ intento, vencido = false }: { intento: number; vencido?: boolean }) {
  const actual = Math.min(5, Math.max(0, intento));
  return (
    <span className="pips" role="img" aria-label={`Intento ${actual} de 5`}>
      {[1, 2, 3, 4, 5].map((numero) => {
        const clase = numero < actual ? "u" : numero === actual ? (vencido ? "u" : "a") : "";
        return <i key={numero} className={clase} />;
      })}
    </span>
  );
}
