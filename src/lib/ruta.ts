import type { GrupoRuta, RespuestaRuta } from "./tipos";

/** Todas las rutas abiertas de la respuesta; si el servidor solo manda una, la convierte en lista. */
export function gruposDe(datos: RespuestaRuta | null): GrupoRuta[] {
  if (!datos) return [];
  if (datos.rutas && datos.rutas.length) return datos.rutas;
  if (datos.ruta) {
    return [{ ruta: datos.ruta, paradas: datos.paradas, resumen: datos.resumen, siguiente_parada: datos.siguiente_parada }];
  }
  return [];
}

/** Elige la ruta indicada; si no existe o no se indicó, la primera. */
export function elegirRuta(datos: RespuestaRuta | null, rutaId: string | null): GrupoRuta | null {
  const grupos = gruposDe(datos);
  return grupos.find((grupo) => grupo.ruta.id === rutaId) ?? grupos[0] ?? null;
}
