// Decide qué hacer cuando el repartidor pide un QR nuevo. Es una función pura para poder probarla.
// La base sigue siendo la autoridad (crear_intento y abrir_cobro vuelven a validar todo);
// esto solo evita que el front adivine con su reloj y pida abrir un cobro que aún no venció.

export const TOLERANCIA_MS = 30_000;
export const MAXIMO_INTENTOS = 5;

export type EntradaPlan = {
  pedidoEstado: string;
  cobroEstado: string;
  /** expira_en de los intentos que siguen en estado «creado». */
  intentosVivos: string[];
  /** Intentos creados desde la última apertura o reapertura del cobro. */
  intentosDesdeApertura: number;
  ahora?: number;
};

export type Plan =
  | { accion: "crear" }
  | { accion: "reabrir" }
  | { accion: "esperar"; segundos: number }
  | { accion: "limite" };

export function planearIntento(entrada: EntradaPlan): Plan {
  const ahora = entrada.ahora ?? Date.now();

  // Un QR sigue vivo hasta su expiración más 30 s: no se genera otro (INTENTO_VIGENTE).
  if (entrada.cobroEstado === "emitido" || entrada.cobroEstado === "en_proceso") {
    const fin = Math.max(0, ...entrada.intentosVivos.map((expira) => new Date(expira).getTime() + TOLERANCIA_MS));
    if (fin > ahora) return { accion: "esperar", segundos: Math.max(1, Math.ceil((fin - ahora) / 1000)) };
  }

  // Cobro vencido y documento de nuevo en pendiente: se reabre, si quedan intentos.
  if (entrada.pedidoEstado === "pendiente" && entrada.cobroEstado === "vencido") {
    if (entrada.intentosDesdeApertura >= MAXIMO_INTENTOS) return { accion: "limite" };
    return { accion: "reabrir" };
  }

  return { accion: "crear" };
}

/** Identificador estable para la reapertura: un reintento de la misma orden no reabre dos veces. */
export async function operacionDerivada(operacionId: string, etiqueta: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${etiqueta}:${operacionId}`));
  const hex = Array.from(new Uint8Array(huella), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
