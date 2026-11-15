export type DetalleReorden = {
  motivo?: string;
  antes?: unknown;
  despues?: unknown;
  ruta_id?: string;
};

export type CambioOrden = {
  id: string;
  alias: string;
  de: number;
  a: number;
};

function lista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}

/**
 * `antes` y `despues` son los folios de documento, en el orden de las paradas que se podían mover.
 * La posición 1 es el primer folio de esa lista. `nombres` va de folio a alias del cliente.
 */
export function cambiosReorden(detalle: DetalleReorden, nombres: ReadonlyMap<string, string>): CambioOrden[] {
  const antes = lista(detalle.antes);
  const despues = lista(detalle.despues);
  const cambios: CambioOrden[] = [];
  despues.forEach((id, indice) => {
    const origen = antes.indexOf(id);
    if (origen >= 0 && origen !== indice) {
      cambios.push({
        id,
        alias: nombres.get(id) ?? "Parada",
        de: origen + 1,
        a: indice + 1,
      });
    }
  });
  return cambios;
}

export function movimientosPorParada(
  eventos: Array<{ id: number; detalle: DetalleReorden }>,
): Map<string, { de: number; a: number }> {
  const mapa = new Map<string, { de: number; a: number }>();
  const ordenados = [...eventos].sort((a, b) => a.id - b.id);
  for (const evento of ordenados) {
    for (const cambio of cambiosReorden(evento.detalle, new Map())) {
      const previo = mapa.get(cambio.id);
      mapa.set(cambio.id, { de: previo?.de ?? cambio.de, a: cambio.a });
    }
  }
  for (const [id, movimiento] of mapa) {
    if (movimiento.de === movimiento.a) mapa.delete(id);
  }
  return mapa;
}

const CLAVE_VISTOS = "poch-avisos-vistos";

export function leerAvisosVistos(): Set<string> {
  try {
    const crudo = sessionStorage.getItem(CLAVE_VISTOS);
    const lista = crudo ? JSON.parse(crudo) as unknown : [];
    if (!Array.isArray(lista)) return new Set();
    return new Set(lista.map((item) => String(item)));
  } catch {
    return new Set();
  }
}

export function marcarAvisoVisto(id: number): void {
  const vistos = leerAvisosVistos();
  vistos.add(String(id));
  sessionStorage.setItem(CLAVE_VISTOS, JSON.stringify([...vistos]));
}
