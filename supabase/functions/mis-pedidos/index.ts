import { exigir } from "../_shared/auth.ts";
import { inicioDelDiaCdmx } from "../_shared/db.ts";
import { json, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const { data: pedidos, error } = await cliente
    .from("pedidos")
    .select("id, folio, cliente_alias, total, estado, creado_en")
    .eq("repartidor_id", perfil.user_id)
    .gte("creado_en", inicioDelDiaCdmx())
    .order("creado_en", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (pedidos ?? []).map((pedido) => pedido.id);
  const cobros = ids.length
    ? await cliente.from("cobros").select("pedido_id, id, estado, importe, vigencia_hasta").in("pedido_id", ids)
    : { data: [], error: null };
  if (cobros.error) throw new Error(cobros.error.message);
  const porPedido = new Map((cobros.data ?? []).map((cobro) => [cobro.pedido_id, cobro]));
  return json(200, {
    pedidos: (pedidos ?? []).map((pedido) => ({ ...pedido, cobro: porPedido.get(pedido.id) ?? null })),
  });
});
