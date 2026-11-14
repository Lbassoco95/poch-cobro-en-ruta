const pesosFormato = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const fechaFormato = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

export function pesos(valor: number | string): string {
  return pesosFormato.format(Number(valor));
}

export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return "Sin fecha";
  return fechaFormato.format(new Date(valor));
}

const ESTADOS: Record<string, string> = {
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
};

export function etiqueta(estado: string | null | undefined): string {
  if (!estado) return "Sin estado";
  return ESTADOS[estado] ?? estado;
}

export function segundosEnReloj(total: number): string {
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}
