import { exigir } from "../_shared/auth.ts";
import { esquemaEvidenciaUrl, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente } = await exigir(req, ["admin"]);
  const datos = validar(esquemaEvidenciaUrl, await leerJson(req));
  const { data: evidencia, error } = await cliente
    .from("entregas_evidencia")
    .select("foto_ruta, firma_ruta")
    .eq("pedido_id", datos.pedido_id)
    .maybeSingle();
  if (error || !evidencia) throw new Error("ENTREGA_NO_ENCONTRADA");
  const ruta = datos.tipo === "foto" ? evidencia.foto_ruta : evidencia.firma_ruta;
  if (!ruta) throw new Error("EVIDENCIA_NO_ENCONTRADA");
  const firmada = await cliente.storage.from("evidencias").createSignedUrl(ruta, 60);
  if (firmada.error || !firmada.data?.signedUrl) throw new Error("EVIDENCIA_NO_ENCONTRADA");
  return json(200, { url: firmada.data.signedUrl, expira_en_segundos: 60, tipo: datos.tipo });
});
