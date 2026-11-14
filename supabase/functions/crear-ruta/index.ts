import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaCrearRuta, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["admin"]);
  const datos = validar(esquemaCrearRuta, await leerJson(req));
  const resultado = await rpc(cliente, "crear_ruta", {
    p_op: datos.operacion_id,
    p_repartidor: datos.repartidor_id,
    p_nombre: datos.nombre,
    p_fecha: datos.fecha,
    p_actor: perfil.user_id,
  });
  return json(200, resultado);
});
