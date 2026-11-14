import { asegurarPedido, exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaDevolver, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["admin", "repartidor"]);
  const datos = validar(esquemaDevolver, await leerJson(req));
  await asegurarPedido(cliente, datos.pedido_id, perfil);
  const resultado = await rpc(cliente, "devolver_documento", {
    p_op: datos.operacion_id,
    p_pedido: datos.pedido_id,
    p_motivo: datos.motivo,
    p_actor: perfil.user_id,
  });
  return json(200, resultado);
});
