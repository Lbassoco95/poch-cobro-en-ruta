import { useState } from "react";
import { horaCorta } from "../lib/formato";
import { cambiosReorden, leerAvisosVistos, marcarAvisoVisto } from "../lib/reorden";
import type { ReordenFila } from "../lib/tipos";

export function AvisosReorden({
  filas,
  nombres,
}: {
  filas: ReordenFila[];
  nombres: ReadonlyMap<string, string>;
}) {
  const [vistos, setVistos] = useState(() => leerAvisosVistos());
  const pendientes = filas.filter((fila) => !vistos.has(String(fila.id)));
  if (!pendientes.length) return null;
  return (
    <div className="margen-top">
      {pendientes.map((fila) => {
        const cambios = cambiosReorden(fila.detalle, nombres);
        return (
          <div key={fila.id} className="aviso-box info bloque">
            <div className="fila">
              <b>↕ {fila.repartidor} cambió el orden de su ruta</b>
              <span className="muted">{horaCorta(fila.ocurrio_en)} h</span>
            </div>
            <div className="muted">Motivo: {fila.detalle?.motivo ?? "Sin motivo"}</div>
            {cambios.map((cambio) => (
              <div key={cambio.id}>{cambio.alias}: parada {cambio.de} → {cambio.a}</div>
            ))}
            <button
              type="button"
              className="btn chico sec margen-top"
              onClick={() => {
                marcarAvisoVisto(fila.id);
                setVistos(leerAvisosVistos());
              }}
            >
              Marcar como visto
            </button>
          </div>
        );
      })}
    </div>
  );
}
