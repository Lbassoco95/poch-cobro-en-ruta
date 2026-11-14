import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaReordenar, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaReordenar, await leerJson(req));
  const resultado = await rpc(cliente, "reordenar_paradas", {
    p_op: datos.operacion_id,
    p_ruta: datos.ruta_id,
    p_repartidor: perfil.user_id,
    p_orden: datos.orden,
    p_motivo: datos.motivo,
  });
  return json(200, resultado);
});
