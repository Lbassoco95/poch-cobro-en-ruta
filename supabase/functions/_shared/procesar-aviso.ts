import { extraerDatosPago, redondear } from "./extraer.ts";
import { verificarFirma } from "./firma.ts";

export type ConfirmacionPago = { status: string; amount: number };

export type EntradaConciliacion = {
  fuente: "webhook" | "conciliacion";
  peyTx: string;
  monto: number;
  pagadoEn: string;
  intentoId: string | null;
  cobroId: string | null;
  numRef: string | null;
  peyQr: string | null;
  banco: string | null;
  tipoCuenta: string | null;
  clabe4: string | null;
  rastreo: string | null;
};

export interface BaseAviso {
  reclamarEvento(evento: { webhookId: string; tipo: string | null; payload: unknown }): Promise<"nuevo" | "pendiente" | "procesado">;
  cerrarEvento(webhookId: string, resultado: string): Promise<void>;
  bitacora(
    actor: string,
    accion: string,
    pedido: string | null,
    cobro: string | null,
    detalle: Record<string, unknown>,
  ): Promise<void>;
  conciliar(entrada: EntradaConciliacion): Promise<{ resultado: string; comprobanteClave?: string | null }>;
}

export async function procesarAviso(entrada: {
  cuerpo: string;
  encabezados: Headers;
  secreto: string;
  base: BaseAviso;
  confirmar: (transactionId: string) => Promise<ConfirmacionPago | null>;
}): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  const firma = await verificarFirma(entrada.cuerpo, entrada.encabezados, entrada.secreto);
  // Firma inválida: se responde 401 y se termina. No se guarda nada (ni evento ni bitácora),
  // para que quien no tiene el secreto no pueda escribir en la base ni ocupar un webhook-id.
  if (!firma.ok) return { estado: 401, cuerpo: { error: "No se aceptó el aviso." } };
  const payload = parsear(entrada.cuerpo);

  const datos = extraerDatosPago(payload);
  const reclamo = await entrada.base.reclamarEvento({
    webhookId: firma.webhookId!,
    tipo: datos.type,
    payload,
  });
  if (reclamo === "procesado") return { estado: 200, cuerpo: { resultado: "ya_procesado" } };

  if (!datos.completo || !datos.transactionId || datos.amount === null || !datos.datePaid) {
    const motivo = datos.motivo ?? "incompleto";
    await entrada.base.bitacora("pey:webhook", "pago_incompleto", null, datos.cobroId, {
      webhook_id: firma.webhookId,
      motivo,
      codi_qr_id: datos.codiQrId,
    });
    await entrada.base.cerrarEvento(firma.webhookId!, motivo);
    return { estado: 200, cuerpo: { resultado: motivo } };
  }

  const confirmacion = await entrada.confirmar(datos.transactionId);
  const montoConfirmado = confirmacion ? redondear(confirmacion.amount) : null;
  if (!confirmacion || confirmacion.status !== "PAID" || montoConfirmado !== datos.amount) {
    await entrada.base.bitacora("pey:webhook", "pago_sin_confirmar", null, datos.cobroId, {
      webhook_id: firma.webhookId,
      transaction_id: datos.transactionId,
    });
    await entrada.base.cerrarEvento(firma.webhookId!, "incompleto");
    return { estado: 200, cuerpo: { resultado: "incompleto" } };
  }

  await entrada.base.bitacora("pey:webhook", "pago_localizado", null, datos.cobroId, {
    via: datos.via,
    intento_id: datos.intentoId,
    num_ref: datos.numRef,
    codi_qr_id: datos.codiQrId,
    webhook_id: firma.webhookId,
  });
  const conciliado = await entrada.base.conciliar({
    fuente: "webhook",
    peyTx: datos.transactionId,
    monto: datos.amount,
    pagadoEn: datos.datePaid,
    intentoId: datos.intentoId,
    cobroId: datos.cobroId,
    numRef: datos.numRef,
    peyQr: datos.codiQrId,
    banco: datos.banco,
    tipoCuenta: datos.tipoCuenta,
    clabe4: datos.clabe4,
    rastreo: datos.rastreo,
  });
  await entrada.base.cerrarEvento(firma.webhookId!, conciliado.resultado);
  return {
    estado: 200,
    cuerpo: {
      resultado: conciliado.resultado,
      comprobante_clave: conciliado.comprobanteClave ?? null,
    },
  };
}

function parsear(cuerpo: string): unknown {
  try {
    return JSON.parse(cuerpo);
  } catch {
    return null;
  }
}
