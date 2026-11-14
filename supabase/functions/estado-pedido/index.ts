import { asegurarPedido, exigir } from "../_shared/auth.ts";
import { esquemaPedidoId, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaPedidoId, await leerJson(req));
  const pedidoBase = await asegurarPedido(cliente, datos.pedido_id, perfil);
  const { data: pedido, error } = await cliente
    .from("pedidos")
    .select("id, folio, cliente_alias, total, estado, creado_en, actualizado_en")
    .eq("id", pedidoBase.id)
    .single();
  if (error) throw new Error(error.message);
  const { data: lineas, error: errorLineas } = await cliente
    .from("pedido_lineas")
    .select("cantidad, precio_unitario, subtotal, producto_id")
    .eq("pedido_id", pedido.id);
  if (errorLineas) throw new Error(errorLineas.message);
  const { data: cobro, error: errorCobro } = await cliente
    .from("cobros")
    .select("id, importe, concepto, estado, vigencia_hasta, pagado_en")
    .eq("pedido_id", pedido.id)
    .maybeSingle();
  if (errorCobro) throw new Error(errorCobro.message);
  const intento = cobro
    ? await cliente
      .from("intentos_pago")
      .select("id, metodo, estado, num_ref, expira_en, pagado_en, pey_id")
      .eq("cobro_id", cobro.id)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null, error: null };
  if (intento.error) throw new Error(intento.error.message);
  const pago = cobro
    ? await cliente
      .from("pagos_confirmados")
      .select("clave_rastreo, pagado_en, resultado, resolucion, pagador_banco, pagador_clabe_ultimos4")
      .eq("cobro_id", cobro.id)
      .or("resultado.eq.aplicado,resolucion.eq.aceptado")
      .limit(1)
      .maybeSingle()
    : { data: null, error: null };
  if (pago.error) throw new Error(pago.error.message);
  const expira = intento.data?.expira_en ? new Date(intento.data.expira_en).getTime() : 0;
  const segundos = expira ? Math.max(0, Math.floor((expira - Date.now()) / 1000)) : 0;
  return json(200, { pedido, lineas: lineas ?? [], cobro, intento: intento.data, segundos, pago: pago.data });
});
