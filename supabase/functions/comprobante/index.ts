import { clienteServicio } from "../_shared/db.ts";
import { json, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const cliente = clienteServicio();
  if (!cliente) return json(503, { error: "El servicio no está configurado." });

  let clave = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    clave = (url.searchParams.get("clave") ?? "").trim();
  } else {
    const cuerpo = await req.json().catch(() => ({}));
    clave = typeof cuerpo?.clave === "string" ? cuerpo.clave.trim() : "";
  }
  if (!/^[a-f0-9]{64}$/i.test(clave)) {
    return json(404, { error: "No se encontró el comprobante." });
  }

  const { data: cobro, error } = await cliente
    .from("cobros")
    .select("id, pedido_id, importe, concepto, estado, pagado_en, comprobante_clave")
    .eq("comprobante_clave", clave)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cobro || cobro.estado !== "pagado") {
    return json(404, { error: "No se encontró el comprobante." });
  }

  const [{ data: pedido }, { data: lineas }, { data: pago }, { data: intento }, { data: entrega }] = await Promise.all([
    cliente.from("pedidos").select("folio").eq("id", cobro.pedido_id).maybeSingle(),
    cliente.from("pedido_lineas").select("cantidad, subtotal, producto_id").eq("pedido_id", cobro.pedido_id),
    cliente
      .from("pagos_confirmados")
      .select("clave_rastreo, pagado_en, resultado, resolucion")
      .eq("cobro_id", cobro.id)
      .or("resultado.eq.aplicado,resolucion.eq.aceptado")
      .limit(1)
      .maybeSingle(),
    cliente
      .from("intentos_pago")
      .select("num_ref")
      .eq("cobro_id", cobro.id)
      .eq("estado", "pagado")
      .order("pagado_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    cliente
      .from("entregas_evidencia")
      .select("recibe_nombre, capturada_en")
      .eq("pedido_id", cobro.pedido_id)
      .maybeSingle(),
  ]);

  const productosIds = (lineas ?? []).map((linea) => linea.producto_id);
  const { data: productos } = productosIds.length
    ? await cliente.from("productos").select("id, nombre, sku").in("id", productosIds)
    : { data: [] };
  const nombres = new Map((productos ?? []).map((producto) => [producto.id, producto.nombre]));

  const empresa = (Deno.env.get("PEY_EMPRESA_NOMBRE") ?? "Empresa Demo").slice(0, 80);
  const cuentaDestino = (Deno.env.get("PEY_CUENTA_ULTIMOS4") ?? "").replace(/\D/g, "").slice(-4);

  return json(200, {
    empresa,
    cuenta_destino_ultimos4: cuentaDestino || null,
    folio: pedido?.folio ?? null,
    concepto: cobro.concepto,
    monto: Number(cobro.importe),
    fecha: pago?.pagado_en ?? cobro.pagado_en,
    num_ref: intento?.num_ref ?? null,
    clave_rastreo: pago?.clave_rastreo ?? null,
    piezas: (lineas ?? []).map((linea) => ({
      nombre: nombres.get(linea.producto_id) ?? "Pieza",
      cantidad: linea.cantidad,
      subtotal: Number(linea.subtotal),
    })),
    entrega: entrega
      ? {
        fecha: entrega.capturada_en,
        recibe: entrega.recibe_nombre,
        leyenda: "Entrega registrada con evidencia",
      }
      : null,
    aviso: "Este documento es informativo. No es un comprobante fiscal.",
  });
});

