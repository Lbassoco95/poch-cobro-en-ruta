import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { extraerDatosPago } from "../_shared/extraer.ts";
import { json, servir } from "../_shared/http.ts";
import { listarTransaccionesDeQr } from "../_shared/pey.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente } = await exigir(req, ["admin"]);
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: intentos, error } = await cliente
    .from("intentos_pago")
    .select("id, cobro_id, pey_id, num_ref, estado, creado_en")
    .eq("metodo", "qr")
    .not("pey_id", "is", null)
    .gte("creado_en", desde)
    .in("estado", ["creado", "pagado"])
    .order("creado_en", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  let revisadas = 0;
  let recuperadas = 0;
  const vistos = new Set<string>();

  for (const intento of intentos ?? []) {
    if (!intento.pey_id || vistos.has(intento.pey_id)) continue;
    vistos.add(intento.pey_id);
    let token: string | null = null;
    let paginas = 0;
    do {
      const pagina = await listarTransaccionesDeQr(intento.pey_id, token);
      paginas += 1;
      // Lista vacía = el QR aún no se pagó (verificado con pago real).
      for (const tx of pagina.items) {
        if (tx.status !== "PAID") continue;
        const datos = extraerDatosPago({
          amount: tx.amount,
          type: "codi.qr.payment_received",
          datePaid: tx.datePaid ?? tx.dateCreated,
          transactionId: tx.id,
          codiQrId: intento.pey_id,
          numRef: intento.num_ref,
          metadata: tx.metadata,
        });
        if (!datos.completo || !datos.transactionId || datos.amount === null || !datos.datePaid) continue;
        revisadas += 1;
        const conciliado = objeto(await rpc(cliente, "conciliar_pago", {
          p_fuente: "conciliacion",
          p_pey_tx: datos.transactionId,
          p_monto: datos.amount,
          p_pagado_en: datos.datePaid,
          p_intento: intento.id,
          p_cobro: intento.cobro_id,
          p_num_ref: intento.num_ref,
          p_banco: datos.banco,
          p_clabe4: datos.clabe4,
          p_rastreo: datos.rastreo,
          p_tipo_cuenta: datos.tipoCuenta,
          p_pey_qr: intento.pey_id,
        }));
        if (conciliado.resultado && conciliado.resultado !== "ya_procesado") recuperadas += 1;
      }
      token = pagina.nextToken;
    } while (token && paginas < 3);
  }

  return json(200, { revisadas, recuperadas, qrs: vistos.size });
});

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
}
