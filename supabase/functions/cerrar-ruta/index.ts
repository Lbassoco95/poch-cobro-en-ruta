import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaCerrarRuta, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["admin"]);
  const datos = validar(esquemaCerrarRuta, await leerJson(req));
  const resultado = await rpc(cliente, "cerrar_ruta", {
    p_op: datos.operacion_id,
    p_ruta: datos.ruta_id,
    p_actor: perfil.user_id,
  });
  return json(200, resultado);
});
