import { exigir } from "../_shared/auth.ts";
import { json, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const url = new URL(req.url);
  let periodo = url.searchParams.get("periodo") ?? "hoy";
  if (req.method === "POST") {
    const cuerpo = await req.json().catch(() => ({})) as { periodo?: string };
    if (cuerpo.periodo) periodo = cuerpo.periodo;
  }
  const rango = periodo === "semana" ? "semana" : "hoy";

  const hoyCdmx = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  let desde: string;
  if (rango === "semana") {
    const base = new Date(`${hoyCdmx}T12:00:00-06:00`);
    base.setUTCDate(base.getUTCDate() - 6);
    const inicio = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(base);
    desde = new Date(`${inicio}T00:00:00-06:00`).toISOString();
  } else {
    desde = new Date(`${hoyCdmx}T00:00:00-06:00`).toISOString();
  }

  const { data: pedidos, error } = await cliente
    .from("pedidos")
    .select("id, folio, cliente_alias, total, estado, actualizado_en, tipo_documento, folio_documento, orden_compra_ref, zona")
    .eq("repartidor_id", perfil.user_id)
    .in("estado", ["entregado", "devuelto", "cancelado"])
    .gte("actualizado_en", desde)
    .order("actualizado_en", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const ids = (pedidos ?? []).map((p) => p.id);
  const { data: cobros } = ids.length
    ? await cliente.from("cobros").select("pedido_id, comprobante_clave").in("pedido_id", ids)
    : { data: [] as Array<{ pedido_id: string; comprobante_clave: string | null }> };
  const clavePorPedido = new Map((cobros ?? []).map((c) => [c.pedido_id, c.comprobante_clave]));

  const cobrado = (pedidos ?? [])
    .filter((p) => p.estado === "entregado")
    .reduce((suma, p) => suma + Number(p.total), 0);

  return json(200, {
    periodo: rango,
    desde,
    total_cobrado: Math.round(cobrado * 100) / 100,
    paradas: (pedidos ?? []).map((p) => ({
      id: p.id,
      folio: p.folio,
      cliente: p.cliente_alias,
      zona: p.zona,
      total: p.total,
      estado: p.estado,
      actualizado_en: p.actualizado_en,
      tipo: p.tipo_documento,
      folio_documento: p.folio_documento,
      orden_compra: p.orden_compra_ref,
      comprobante_clave: clavePorPedido.get(p.id) ?? null,
    })),
  });
});
