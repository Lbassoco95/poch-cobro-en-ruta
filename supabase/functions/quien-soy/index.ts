import { exigir } from "../_shared/auth.ts";
import { json, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { perfil } = await exigir(req, ["admin", "repartidor"]);
  return json(200, { user_id: perfil.user_id, rol: perfil.rol, nombre: perfil.nombre });
});
