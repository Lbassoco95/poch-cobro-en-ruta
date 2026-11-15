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
    .select("id, folio, cliente_alias, total, estado, creado_en, actualizado_en, tipo_documento, folio_documento, orden_compra_ref, parada, ruta_id")
    .eq("id", pedidoBase.id)
    .single();
  if (error) throw new Error(error.message);
  const { data: lineasCrudas, error: errorLineas } = await cliente
    .from("pedido_lineas")
    .select("cantidad, precio_unitario, subtotal, producto_id")
    .eq("pedido_id", pedido.id);
  if (errorLineas) throw new Error(errorLineas.message);
  const productoIds = [...new Set((lineasCrudas ?? []).map((l) => l.producto_id))];
  const { data: productos } = productoIds.length
    ? await cliente.from("productos").select("id, nombre, sku").in("id", productoIds)
    : { data: [] as Array<{ id: string; nombre: string; sku: string }> };
  const mapa = new Map((productos ?? []).map((p) => [p.id, p]));
  const lineas = (lineasCrudas ?? []).map((l) => ({ ...l, producto: mapa.get(l.producto_id) ?? null }));

  const { data: cobro, error: errorCobro } = await cliente
    .from("cobros")
    .select("id, importe, concepto, estado, vigencia_hasta, pagado_en, comprobante_clave, creado_en, reabierto_en")
    .eq("pedido_id", pedido.id)
    .maybeSingle();
  if (errorCobro) throw new Error(errorCobro.message);
  const intento = cobro
    ? await cliente
      .from("intentos_pago")
      .select("id, metodo, estado, num_ref, expira_en, pagado_en, pey_id, creado_en")
      .eq("cobro_id", cobro.id)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null, error: null };
  if (intento.error) throw new Error(intento.error.message);

  let intentos_desde_apertura = 0;
  if (cobro) {
    const desde = cobro.reabierto_en ?? cobro.creado_en;
    const { count } = await cliente
      .from("intentos_pago")
      .select("id", { count: "exact", head: true })
      .eq("cobro_id", cobro.id)
      .gte("creado_en", desde);
    intentos_desde_apertura = count ?? 0;
  }

  const pago = cobro
    ? await cliente
      .from("pagos_confirmados")
      .select("monto, clave_rastreo, pagado_en, resultado, resolucion, pagador_banco, pagador_clabe_ultimos4")
      .eq("cobro_id", cobro.id)
      .or("resultado.eq.aplicado,resolucion.eq.aceptado")
      .limit(1)
      .maybeSingle()
    : { data: null, error: null };
  if (pago.error) throw new Error(pago.error.message);
  const expira = intento.data?.expira_en ? new Date(intento.data.expira_en).getTime() : 0;
  const segundos = expira ? Math.max(0, Math.floor((expira - Date.now()) / 1000)) : 0;
  const pagoRepartidor = pago.data
    ? {
      monto: pago.data.monto,
      clave_rastreo: pago.data.clave_rastreo,
      pagado_en: pago.data.pagado_en,
      pagador_banco: pago.data.pagador_banco,
      pagador_clabe_ultimos4: pago.data.pagador_clabe_ultimos4,
    }
    : null;
  return json(200, {
    pedido,
    lineas,
    cobro,
    intento: intento.data,
    segundos,
    intentos_desde_apertura,
    quedan_intentos: Math.max(0, 5 - intentos_desde_apertura),
    pago: pagoRepartidor,
    comprobante_clave: cobro?.comprobante_clave ?? null,
  });
});
