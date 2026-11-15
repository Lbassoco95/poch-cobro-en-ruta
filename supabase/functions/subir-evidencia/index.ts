import { asegurarPedido, exigir } from "../_shared/auth.ts";
import { esquemaSubirEvidencia, validar } from "../_shared/esquemas.ts";
import { json, leerJson, servir } from "../_shared/http.ts";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 5 * 1024 * 1024;

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const datos = validar(esquemaSubirEvidencia, await leerJson(req));
  const pedido = await asegurarPedido(cliente, datos.pedido_id, perfil);
  if (pedido.estado !== "pagado") throw new Error("PEDIDO_NO_PAGADO");

  const fotoRuta = `evidencias/${datos.pedido_id}/foto.jpg`;
  const firmaRuta = `evidencias/${datos.pedido_id}/firma.png`;

  const [foto, firma] = await Promise.all([
    cliente.storage.from("evidencias").createSignedUploadUrl(fotoRuta, { upsert: true }),
    cliente.storage.from("evidencias").createSignedUploadUrl(firmaRuta, { upsert: true }),
  ]);
  if (foto.error || firma.error) throw new Error(foto.error?.message ?? firma.error?.message ?? "EVIDENCIA_INVALIDA");

  return json(200, {
    foto: { ruta: fotoRuta, url: foto.data.signedUrl, token: foto.data.token, max_bytes: MAX, tipos: [...TIPOS] },
    firma: { ruta: firmaRuta, url: firma.data.signedUrl, token: firma.data.token, max_bytes: MAX, tipos: [...TIPOS] },
  });
});
