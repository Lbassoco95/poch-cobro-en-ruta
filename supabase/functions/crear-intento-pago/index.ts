import { asegurarPedido, exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaIntento, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";
import { crearAviso, crearQr } from "../_shared/pey.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaIntento, await leerJson(req));
  const { data: cobro, error } = await cliente
    .from("cobros")
    .select("id, pedido_id, importe, concepto")
    .eq("id", datos.cobro_id)
    .maybeSingle();
  if (error || !cobro) throw new Error("COBRO_NO_ENCONTRADO");
  await asegurarPedido(cliente, cobro.pedido_id, perfil);

  const resultado = objeto(await rpc(cliente, "crear_intento", {
    p_op: datos.operacion_id,
    p_cobro: datos.cobro_id,
    p_metodo: datos.metodo,
    p_actor: perfil.user_id,
  }));
  if (typeof resultado.qr_imagen === "string" || typeof resultado.qr_cadena === "string" || resultado.ya_enviado === true) {
    return json(200, resultado);
  }
  if (typeof resultado.intento_id !== "string") {
    return json(409, { error: "Esta operación ya se envió. Genere el cobro de nuevo." });
  }

  const { data: intento, error: errorIntento } = await cliente
    .from("intentos_pago")
    .select("id, estado, pey_id, num_ref, monto, expira_en")
    .eq("id", resultado.intento_id)
    .maybeSingle();
  if (errorIntento || !intento) throw new Error("COBRO_NO_ENCONTRADO");
  if (intento.estado === "error") {
    return json(409, { error: "Ese intento no se completó. Genere otro cobro." });
  }
  if (intento.pey_id) {
    return json(200, { ...resultado, pey_id: intento.pey_id, pendiente_de_imagen: datos.metodo === "qr" });
  }

  try {
    if (datos.metodo === "qr") {
      const qr = await crearQr({
        amount: Number(intento.monto),
        concept: cobro.concepto,
        numRef: intento.num_ref,
        intentoId: intento.id,
        cobroId: cobro.id,
      });
      // Guarda el id del QR. El transactionId llega hasta que el cliente paga.
      await rpc(cliente, "registrar_intento_pey", { p_intento: intento.id, p_pey_id: qr.id, p_codi_id: qr.id });
      const respuesta = { ...resultado, pey_id: qr.id, qr_imagen: qr.qrImage, qr_cadena: qr.qrString };
      await cliente.from("operaciones").update({ resultado: respuesta }).eq("operacion_id", datos.operacion_id);
      return json(200, respuesta);
    }
    const aviso = await crearAviso({
      amount: Number(intento.monto),
      concept: cobro.concepto,
      numRef: intento.num_ref,
      celular: datos.celular!,
      intentoId: intento.id,
      cobroId: cobro.id,
    });
    // El transactionId llega con el pago; aquí se guarda el id del aviso CoDi.
    await rpc(cliente, "registrar_intento_pey", {
      p_intento: intento.id,
      p_pey_id: aviso.id,
      p_codi_id: aviso.codiId,
    });
    const respuesta = { ...resultado, pey_id: aviso.id, ya_enviado: true };
    await cliente.from("operaciones").update({ resultado: respuesta }).eq("operacion_id", datos.operacion_id);
    return json(200, respuesta);
  } catch (fallo) {
    const motivo = fallo instanceof Error ? fallo.message : "pey";
    await rpc(cliente, "marcar_intento_error", { p_intento: intento.id, p_motivo: motivo.slice(0, 80) });
    throw fallo;
  }
});

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
}
