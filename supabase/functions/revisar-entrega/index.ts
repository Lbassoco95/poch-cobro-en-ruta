import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaRevisarEntrega, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["admin"]);
  const datos = validar(esquemaRevisarEntrega, await leerJson(req));
  const resultado = await rpc(cliente, "revisar_entrega", {
    p_op: datos.operacion_id,
    p_pedido: datos.pedido_id,
    p_nota: datos.nota,
    p_actor: perfil.user_id,
  });
  return json(200, resultado);
});
