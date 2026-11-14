const pesosFormato = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const fechaFormato = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});
const horaFormato = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Mexico_City",
});

export function pesos(valor: number | string): string {
  return pesosFormato.format(Number(valor));
}

export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return "Sin fecha";
  return fechaFormato.format(new Date(valor));
}

export function horaCorta(valor: string | null | undefined): string {
  if (!valor) return "—";
  return horaFormato.format(new Date(valor));
}

export function fechaLarga(dia: string | null | undefined): string {
  if (!dia) return "Hoy";
  const fecha = new Date(`${dia}T12:00:00-06:00`);
  const texto = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente",
  por_cobrar: "Por cobrar",
  pagado: "Pagado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  emitido: "Emitido",
  en_proceso: "En proceso",
  vencido: "Vencido",
  creado: "Creado",
  expirado: "Expirado",
  error: "Con error",
  aplicado: "Aplicado",
  monto_distinto: "Monto distinto",
  fuera_de_vigencia: "Fuera de vigencia",
  duplicado: "Duplicado",
  sin_cobro: "Sin cobro",
  cobro_cancelado: "Cobro cancelado",
  aceptado: "Aceptado",
  devolucion_pendiente: "Devolución pendiente",
  devuelto: "Devuelto",
  qr: "Código QR",
  push: "Aviso al celular",
  remision: "Remisión",
  nota_venta: "Nota de venta",
  orden_compra: "Orden de compra",
  abierta: "Abierta",
  cerrada: "Cerrada",
};

export function etiqueta(estado: string | null | undefined): string {
  if (!estado) return "Sin estado";
  return ESTADOS[estado] ?? estado;
}

export function segundosEnReloj(total: number): string {
  const seguro = Math.max(0, Math.floor(total));
  const minutos = Math.floor(seguro / 60);
  const segundos = seguro % 60;
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

export function srcQr(imagen: string): string {
  if (imagen.startsWith("data:")) return imagen;
  return `data:image/png;base64,${imagen}`;
}

const CLAVE_QR = (pedidoId: string) => `poch-qr-${pedidoId}`;

export function guardarQr(pedidoId: string, imagen: string): void {
  sessionStorage.setItem(CLAVE_QR(pedidoId), imagen);
}

export function leerQr(pedidoId: string): string | null {
  return sessionStorage.getItem(CLAVE_QR(pedidoId));
}

export function borrarQr(pedidoId: string): void {
  sessionStorage.removeItem(CLAVE_QR(pedidoId));
}
