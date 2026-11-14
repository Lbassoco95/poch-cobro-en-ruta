import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { extraerDatosPago } from "../_shared/extraer.ts";
import { json, servir } from "../_shared/http.ts";
import { listarTransacciones } from "../_shared/pey.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente } = await exigir(req, ["admin"]);
  let token: string | null = null;
  let paginas = 0;
  let revisadas = 0;
  let recuperadas = 0;
  const limite = Date.now() - 24 * 60 * 60 * 1000;
  do {
    const pagina = await listarTransacciones(token);
    paginas += 1;
    let llegarAlCorte = false;
    for (const tx of pagina.items) {
      const marca = (tx.datePaid ?? tx.dateCreated ?? 0) * 1000;
      if (marca && marca < limite) {
        llegarAlCorte = true;
        break;
      }
      if (tx.status !== "PAID") continue;
      if (tx.payableType !== "API_CODI_QR" && tx.payableType !== "API_CODI_PN") continue;
      const tipo = tx.payableType === "API_CODI_QR" ? "codi.qr.payment_received" : "codi.pn.payment_received";
      const datos = extraerDatosPago({
        amount: tx.amount,
        type: tipo,
        datePaid: tx.datePaid,
        transactionId: tx.id,
        concept: tx.description,
        metadata: tx.metadata,
      });
      if (!datos.completo || !datos.transactionId || datos.amount === null || !datos.datePaid) continue;
      revisadas += 1;
      const conciliado = objeto(await rpc(cliente, "conciliar_pago", {
        p_fuente: "conciliacion",
        p_pey_tx: datos.transactionId,
        p_monto: datos.amount,
        p_pagado_en: datos.datePaid,
        p_intento: datos.intentoId,
        p_cobro: datos.cobroId,
        p_num_ref: datos.numRef,
        p_banco: datos.banco,
        p_clabe4: datos.clabe4,
        p_rastreo: datos.rastreo,
      }));
      if (conciliado.resultado && conciliado.resultado !== "ya_procesado") recuperadas += 1;
    }
    token = llegarAlCorte ? null : pagina.nextToken;
  } while (token && paginas < 3);
  return json(200, { revisadas, recuperadas, paginas });
});

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
}
