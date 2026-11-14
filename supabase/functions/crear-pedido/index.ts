import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaPedido, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaPedido, await leerJson(req));
  const resultado = await rpc(cliente, "crear_pedido_con_cobro", {
    p_op: datos.operacion_id,
    p_repartidor: perfil.user_id,
    p_cliente: datos.cliente_alias,
    p_lineas: datos.lineas,
    p_vigencia_min: datos.vigencia_min ?? 15,
  });
  return json(200, resultado);
});
