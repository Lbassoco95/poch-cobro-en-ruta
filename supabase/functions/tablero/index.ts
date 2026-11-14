import { exigir } from "../_shared/auth.ts";
import { inicioDelDiaCdmx } from "../_shared/db.ts";
import { esquemaTablero, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente } = await exigir(req, ["admin"]);
  const filtros = validar(esquemaTablero, req.method === "POST" ? await leerJson(req) : {});
  if (filtros.pedido_id) return json(200, await detalle(cliente, filtros.pedido_id));
  return json(200, await resumen(cliente, filtros.estado, filtros.repartidor_id));
});

type Cliente = Awaited<ReturnType<typeof exigir>>["cliente"];

async function resumen(cliente: Cliente, estado?: string, repartidorId?: string) {
  const desde = inicioDelDiaCdmx();
  const [repartidores, pedidos, cobros, pagos, stock] = await Promise.all([
    cliente.from("perfiles").select("user_id, nombre").eq("rol", "repartidor").eq("activo", true).order("nombre"),
    cliente.from("pedidos").select("id, folio, cliente_alias, total, estado, creado_en, repartidor_id").order("creado_en", { ascending: false }).limit(200),
    cliente.from("cobros").select("id, pedido_id, importe, estado, actualizado_en, pagado_en"),
    cliente.from("pagos_confirmados").select("id, cobro_id, monto, resultado, resolucion, fuente, pagado_en, recibido_en, pagador_banco, pagador_tipo_cuenta, pagador_clabe_ultimos4, clave_rastreo, nota_resolucion"),
    cliente.from("v_stock_repartidor").select("repartidor_id, existencia, apartado"),
  ]);
  for (const consulta of [repartidores, pedidos, cobros, pagos, stock]) {
    if (consulta.error) throw new Error(consulta.error.message);
  }
  const nombres = new Map((repartidores.data ?? []).map((fila) => [fila.user_id, fila.nombre]));
  const cobroPorPedido = new Map((cobros.data ?? []).map((cobro) => [cobro.pedido_id, cobro]));
  const indicadores = {
    cobrado: 0,
    pendiente: 0,
    vencido: 0,
    por_resolver: 0,
    recuperados: 0,
  };
  for (const pago of pagos.data ?? []) {
    const aplicado = pago.resultado === "aplicado" || pago.resolucion === "aceptado";
    if (aplicado && pago.pagado_en >= desde) indicadores.cobrado = redondear(indicadores.cobrado + Number(pago.monto));
    if (!aplicado && !pago.resolucion) indicadores.por_resolver += 1;
    if (pago.fuente === "conciliacion" && pago.resultado === "aplicado" && pago.recibido_en >= desde) indicadores.recuperados += 1;
  }
  for (const cobro of cobros.data ?? []) {
    if (cobro.estado === "emitido" || cobro.estado === "en_proceso") {
      indicadores.pendiente = redondear(indicadores.pendiente + Number(cobro.importe));
    }
    if (cobro.estado === "vencido" && cobro.actualizado_en >= desde) indicadores.vencido += 1;
  }
  const disponiblePorRepartidor = new Map<string, number>();
  for (const fila of stock.data ?? []) {
    const disponible = Number(fila.existencia) - Number(fila.apartado);
    disponiblePorRepartidor.set(fila.repartidor_id, (disponiblePorRepartidor.get(fila.repartidor_id) ?? 0) + disponible);
  }
  const resumenRepartidores = (repartidores.data ?? []).map((repartidor) => {
    const suyos = (pedidos.data ?? []).filter((pedido) => pedido.repartidor_id === repartidor.user_id && pedido.creado_en >= desde);
    const cobrado = suyos.reduce((suma, pedido) => {
      const cobro = cobroPorPedido.get(pedido.id);
      return cobro && (cobro.estado === "pagado") ? suma + Number(cobro.importe) : suma;
    }, 0);
    return {
      repartidor_id: repartidor.user_id,
      nombre: repartidor.nombre,
      pedidos: suyos.length,
      cobrado: redondear(cobrado),
      stock_disponible: disponiblePorRepartidor.get(repartidor.user_id) ?? 0,
    };
  });
  const lista = (pedidos.data ?? [])
    .filter((pedido) => !estado || pedido.estado === estado)
    .filter((pedido) => !repartidorId || pedido.repartidor_id === repartidorId)
    .map((pedido) => ({
      ...pedido,
      repartidor: nombres.get(pedido.repartidor_id) ?? "Repartidor",
      cobro: cobroPorPedido.get(pedido.id) ?? null,
    }));
  const discrepancias = (pagos.data ?? [])
    .filter((pago) => pago.resultado !== "aplicado")
    .map((pago) => {
      const cobro = (cobros.data ?? []).find((fila) => fila.id === pago.cobro_id);
      const pedido = cobro ? (pedidos.data ?? []).find((fila) => fila.id === cobro.pedido_id) : undefined;
      return {
        ...pago,
        folio: pedido?.folio ?? null,
        pedido_id: pedido?.id ?? null,
        repartidor: pedido ? nombres.get(pedido.repartidor_id) ?? "Repartidor" : null,
      };
    });
  return {
    indicadores,
    repartidores: resumenRepartidores,
    pedidos: lista,
    discrepancias,
    generado_en: new Date().toISOString(),
  };
}

async function detalle(cliente: Cliente, pedidoId: string) {
  const { data: pedido, error } = await cliente
    .from("pedidos")
    .select("id, folio, cliente_alias, total, estado, creado_en, actualizado_en, repartidor_id")
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pedido) throw new Error("PEDIDO_NO_ENCONTRADO");
  const [perfil, lineas, productos, cobro, bitacora] = await Promise.all([
    cliente.from("perfiles").select("nombre").eq("user_id", pedido.repartidor_id).maybeSingle(),
    cliente.from("pedido_lineas").select("producto_id, cantidad, precio_unitario, subtotal").eq("pedido_id", pedido.id),
    cliente.from("productos").select("id, sku, nombre"),
    cliente.from("cobros").select("id, importe, concepto, estado, vigencia_hasta, pagado_en, comprobante_clave").eq("pedido_id", pedido.id).maybeSingle(),
    cliente.from("bitacora").select("id, ocurrio_en, actor, accion, detalle").eq("pedido_id", pedido.id).order("id"),
  ]);
  for (const consulta of [perfil, lineas, productos, cobro, bitacora]) {
    if (consulta.error) throw new Error(consulta.error.message);
  }
  const nombres = new Map((productos.data ?? []).map((producto) => [producto.id, producto]));
  const intentos = cobro.data
    ? await cliente.from("intentos_pago").select("id, metodo, estado, num_ref, creado_en, expira_en, pagado_en").eq("cobro_id", cobro.data.id).order("creado_en")
    : { data: [], error: null };
  if (intentos.error) throw new Error(intentos.error.message);
  const pagos = cobro.data
    ? await cliente.from("pagos_confirmados").select("id, monto, resultado, resolucion, fuente, pagado_en, pagador_banco, pagador_tipo_cuenta, pagador_clabe_ultimos4, clave_rastreo, nota_resolucion").eq("cobro_id", cobro.data.id)
    : { data: [], error: null };
  if (pagos.error) throw new Error(pagos.error.message);
  return {
    pedido: { ...pedido, repartidor: perfil.data?.nombre ?? "Repartidor" },
    lineas: (lineas.data ?? []).map((linea) => ({ ...linea, producto: nombres.get(linea.producto_id) ?? null })),
    cobro: cobro.data,
    intentos: intentos.data ?? [],
    pagos: pagos.data ?? [],
    bitacora: (bitacora.data ?? []).map((fila) => ({ ...fila, detalle: limpiar(fila.detalle) })),
  };
}

function limpiar(detalle: unknown): unknown {
  if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) return detalle;
  const copia = { ...(detalle as Record<string, unknown>) };
  delete copia.clabe;
  delete copia.telefono;
  delete copia.celular;
  return copia;
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
