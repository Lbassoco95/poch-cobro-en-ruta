import { asegurarPedido, exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaEntrega, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaEntrega, await leerJson(req));
  await asegurarPedido(cliente, datos.pedido_id, perfil);
  const resultado = await rpc(cliente, "marcar_entregado", {
    p_op: datos.operacion_id,
    p_pedido: datos.pedido_id,
    p_repartidor: perfil.user_id,
  });
  return json(200, resultado);
});
