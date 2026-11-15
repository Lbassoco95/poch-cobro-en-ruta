// Agrupa las paradas por ruta y calcula el resumen de cada una. Función pura para poder probarla.

export type ParadaBase = { id: string; ruta_id: string; estado: string; total: number | string };
export type RutaBase = { id: string; nombre: string; fecha: string; estado: string };

export type GrupoRuta<P extends ParadaBase, R extends RutaBase> = {
  ruta: R;
  paradas: P[];
  resumen: { entregadas: number; cobrado: number; por_cobrar: number };
  siguiente_parada: string | null;
};

const ABIERTAS = ["pendiente", "por_cobrar"];

export function armarGrupos<P extends ParadaBase, R extends RutaBase>(rutas: R[], paradas: P[]): Array<GrupoRuta<P, R>> {
  return rutas.map((ruta) => {
    const lista = paradas.filter((parada) => parada.ruta_id === ruta.id);
    const resumen = {
      entregadas: lista.filter((p) => p.estado === "entregado").length,
      cobrado: redondear(lista.filter((p) => p.estado === "pagado" || p.estado === "entregado").reduce((s, p) => s + Number(p.total), 0)),
      por_cobrar: redondear(lista.filter((p) => ABIERTAS.includes(p.estado)).reduce((s, p) => s + Number(p.total), 0)),
    };
    const siguiente = lista.find((p) => ABIERTAS.includes(p.estado) || p.estado === "pagado") ?? null;
    return { ruta, paradas: lista, resumen, siguiente_parada: siguiente?.id ?? null };
  });
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
