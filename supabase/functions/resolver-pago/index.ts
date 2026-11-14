import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaResolver, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["admin"]);
  const datos = validar(esquemaResolver, await leerJson(req));
  const resultado = await rpc(cliente, "resolver_pago", {
    p_op: datos.operacion_id,
    p_pago: datos.pago_id,
    p_accion: datos.accion,
    p_nota: datos.nota,
    p_actor: perfil.user_id,
  });
  return json(200, resultado);
});
