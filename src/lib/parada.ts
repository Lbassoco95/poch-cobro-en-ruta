/**
 * Regla que Polo puede cambiar en un solo lugar.
 * true = la maqueta de hoy: una parada con QR en espera sí se mueve.
 * false = esa parada queda fija y no se intercambia con la vecina.
 * El servidor solo acepta paradas en pendiente o por cobrar, y pide la lista completa.
 */
export const MOVER_PARADA_CON_COBRO_EN_CURSO = true;

export type CobroBreve = { estado?: string | null; vigente?: boolean | null } | null;

export type ParadaMovible = {
  estado: string;
  cobro?: CobroBreve;
};

export type TipoInsignia =
  | "porcobrar"
  | "pendiente"
  | "pagado"
  | "vencido"
  | "cancelado"
  | "entregado"
  | "devuelto";

export function paradaSePuedeMover(parada: ParadaMovible): boolean {
  if (parada.estado !== "pendiente" && parada.estado !== "por_cobrar") return false;
  if (!MOVER_PARADA_CON_COBRO_EN_CURSO && parada.cobro?.vigente) return false;
  return true;
}

export function puedeIntercambiar(lista: ParadaMovible[], indice: number, destino: number): boolean {
  const otra = lista[destino];
  const actual = lista[indice];
  if (!actual || !otra) return false;
  return paradaSePuedeMover(actual) && paradaSePuedeMover(otra);
}

export function insigniaDeParada(parada: { estado: string; cobro?: CobroBreve }): TipoInsignia {
  if (parada.estado === "entregado") return "entregado";
  if (parada.estado === "cancelado") return "cancelado";
  if (parada.estado === "devuelto") return "devuelto";
  if (parada.estado === "pagado") return "pagado";
  if (parada.cobro?.vigente) return "pendiente";
  if (parada.cobro?.estado === "vencido") return "vencido";
  return "porcobrar";
}

export function textoBotonParada(parada: { estado: string; cobro?: CobroBreve }): string {
  if (parada.estado === "entregado") return "Ver remisión";
  if (parada.estado === "pagado") return "Marcar entrega";
  if (parada.cobro?.vigente) return "Ver cobro";
  if (parada.cobro?.estado === "vencido") return "↻ Generar otro QR";
  if (parada.estado === "pendiente" || parada.estado === "por_cobrar") return "Ver remisión y cobrar";
  return "Ver remisión";
}

export function piezasDe(piezas: Array<{ cantidad: number }>): number {
  return piezas.reduce((suma, pieza) => suma + Number(pieza.cantidad), 0);
}

export function textoPiezas(cantidad: number): string {
  return cantidad === 1 ? "1 pieza" : `${cantidad} piezas`;
}

/** La opción «Otro» de la maqueta tiene 4 caracteres; reordenar_paradas exige 5. */
export const MOTIVOS_ORDEN = [
  { etiqueta: "Tráfico", texto: "Tráfico" },
  { etiqueta: "El cliente lo pidió", texto: "El cliente lo pidió" },
  { etiqueta: "Cierra temprano", texto: "Cierra temprano" },
  { etiqueta: "Otro", texto: "Otro motivo" },
] as const;

export type EtiquetaMotivo = (typeof MOTIVOS_ORDEN)[number]["etiqueta"];
