import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { json, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente } = await exigir(req, ["admin"]);
  const pruebas = await rpc(cliente, "verificar_integridad", {});
  return json(200, { pruebas: Array.isArray(pruebas) ? pruebas : [] });
});
