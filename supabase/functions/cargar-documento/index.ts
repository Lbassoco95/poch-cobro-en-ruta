import { exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaCargarDocumento, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["admin"]);
  const datos = validar(esquemaCargarDocumento, await leerJson(req));
  const resultado = await rpc(cliente, "cargar_documento", {
    p_op: datos.operacion_id,
    p_ruta: datos.ruta_id,
    p_tipo: datos.tipo,
    p_folio: datos.folio,
    p_cliente: datos.cliente,
    p_lineas: datos.lineas,
    p_actor: perfil.user_id,
    p_orden_compra: datos.orden_compra ?? null,
    // La base de producción no tiene columna ni parámetro de zona: no se envía.
  });
  return json(200, resultado);
});
