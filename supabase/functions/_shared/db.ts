import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { payloadSinClabe } from "./extraer.ts";
import type { BaseAviso, EntradaConciliacion, EventoGuardado } from "./procesar-aviso.ts";

export type Cliente = SupabaseClient;

export function clienteServicio(): Cliente | null {
  const url = Deno.env.get("SUPABASE_URL");
  const llave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !llave) return null;
  return createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function rpc(cliente: Cliente, nombre: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await cliente.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function expirar(cliente: Cliente): Promise<void> {
  await rpc(cliente, "expirar_vencidos", {});
}

export function inicioDelDiaCdmx(): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${fecha}T00:00:00-06:00`).toISOString();
}

export function baseAviso(cliente: Cliente): BaseAviso {
  return {
    async guardarEvento(evento: EventoGuardado) {
      const { error } = await cliente.from("eventos_pey").insert({
        webhook_id: evento.webhookId,
        tipo: evento.tipo,
        firma_valida: evento.firmaValida,
        payload: payloadSinClabe(evento.payload),
        procesado: evento.procesado,
        resultado: evento.resultado,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
    },
    async reclamarEvento(evento) {
      const { error } = await cliente.from("eventos_pey").insert({
        webhook_id: evento.webhookId,
        tipo: evento.tipo,
        firma_valida: true,
        payload: payloadSinClabe(evento.payload),
        procesado: false,
        resultado: null,
      });
      if (!error) return "nuevo";
      if (error.code !== "23505") throw new Error(error.message);
      const { data, error: lectura } = await cliente
        .from("eventos_pey")
        .select("procesado")
        .eq("webhook_id", evento.webhookId)
        .maybeSingle();
      if (lectura || !data) throw new Error(lectura?.message ?? "EVENTO");
      return data.procesado ? "procesado" : "pendiente";
    },
    async cerrarEvento(webhookId, resultado) {
      const { error } = await cliente.from("eventos_pey").update({ procesado: true, resultado }).eq("webhook_id", webhookId);
      if (error) throw new Error(error.message);
    },
    async bitacora(actor, accion, pedido, cobro, detalle) {
      await rpc(cliente, "reg_bitacora", {
        p_actor: actor,
        p_accion: accion,
        p_pedido: pedido,
        p_cobro: cobro,
        p_operacion: null,
        p_detalle: detalle,
      });
    },
    async conciliar(entrada: EntradaConciliacion) {
      const data = await rpc(cliente, "conciliar_pago", {
        p_fuente: entrada.fuente,
        p_pey_tx: entrada.peyTx,
        p_monto: entrada.monto,
        p_pagado_en: entrada.pagadoEn,
        p_intento: entrada.intentoId,
        p_cobro: entrada.cobroId,
        p_num_ref: entrada.numRef,
        p_banco: entrada.banco,
        p_clabe4: entrada.clabe4,
        p_rastreo: entrada.rastreo,
      });
      const resultado = data && typeof data === "object" && "resultado" in data
        ? String((data as { resultado: unknown }).resultado)
        : "incompleto";
      return { resultado };
    },
  };
}
