import { asegurarPedido, exigir } from "../_shared/auth.ts";
import { rpc } from "../_shared/db.ts";
import { esquemaEntrega, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaEntrega, await leerJson(req));
  await asegurarPedido(cliente, datos.pedido_id, perfil);

  for (const ruta of [datos.foto_ruta, datos.firma_ruta]) {
    if (!ruta) continue;
    if (!ruta.startsWith(`evidencias/${datos.pedido_id}/`)) throw new Error("EVIDENCIA_INVALIDA");
    // El objeto se sube como `evidencias/<pedido>/<archivo>` dentro del bucket `evidencias`,
    // así que la carpeta a listar se deriva de la propia ruta (no solo del id del pedido).
    const carpeta = ruta.split("/").slice(0, -1).join("/");
    const { data, error } = await cliente.storage.from("evidencias").list(carpeta, { limit: 20 });
    if (error) throw new Error("EVIDENCIA_NO_ENCONTRADA");
    const nombre = ruta.split("/").pop();
    const archivo = (data ?? []).find((fila) => fila.name === nombre);
    if (!archivo || Number(archivo.metadata?.size ?? 0) <= 0) throw new Error("EVIDENCIA_NO_ENCONTRADA");
  }

  const resultado = await rpc(cliente, "marcar_entregado", {
    p_op: datos.operacion_id,
    p_pedido: datos.pedido_id,
    p_repartidor: perfil.user_id,
    p_recibe: datos.recibe_nombre,
    p_foto_ruta: datos.foto_ruta ?? null,
    p_foto_hash: datos.foto_hash ?? null,
    p_firma_ruta: datos.firma_ruta ?? null,
    p_firma_hash: datos.firma_hash ?? null,
    p_excepcion: datos.excepcion ?? null,
    p_nota: datos.nota ?? null,
    p_latitud: datos.latitud ?? null,
    p_longitud: datos.longitud ?? null,
  });
  return json(200, resultado);
});
