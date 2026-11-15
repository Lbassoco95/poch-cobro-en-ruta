import { useEffect, useState } from "react";
import { Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";

type Pieza = { id: string; sku: string; nombre: string; existencia: number; apartado: number; disponible: number };

export default function Camioneta() {
  const { sesion } = useSesion();
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sesion) return;
    llamar<{ piezas: Pieza[] }>("mi-camioneta", sesion.token)
      .then((data) => setPiezas(data.piezas))
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo ver la camioneta."));
  }, [sesion]);

  return (
    <Marco titulo="Mi camioneta" enlaces={[{ a: "/repartidor", texto: "Pedidos" }]}>
      {error && <p role="alert">{error}</p>}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Existencia de la camioneta</caption>
        <thead>
          <tr className="text-marino/70">
            <th className="py-2 font-medium">Pieza</th>
            <th className="py-2 font-medium">Existencia</th>
            <th className="py-2 font-medium">Apartado</th>
            <th className="py-2 font-medium">Disponible</th>
          </tr>
        </thead>
        <tbody>
          {piezas.map((pieza) => (
            <tr key={pieza.id} className="border-t border-linea">
              <th scope="row" className="py-3 font-medium">{pieza.nombre}</th>
              <td>{pieza.existencia}</td>
              <td>{pieza.apartado}</td>
              <td className="font-semibold">{pieza.disponible}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Marco>
  );
}
