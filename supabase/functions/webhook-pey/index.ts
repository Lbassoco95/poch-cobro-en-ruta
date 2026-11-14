import { baseAviso, clienteServicio, expirar } from "../_shared/db.ts";
import { json, servir } from "../_shared/http.ts";
import { obtenerTransaccion } from "../_shared/pey.ts";
import { procesarAviso } from "../_shared/procesar-aviso.ts";

const LIMITE = 262_144;

servir(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  const anunciado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(anunciado) && anunciado > LIMITE) return json(413, { error: "El aviso es demasiado grande." });
  const cuerpo = await req.text();
  if (cuerpo.length > LIMITE) return json(413, { error: "El aviso es demasiado grande." });
  const secreto = Deno.env.get("PEY_WEBHOOK_SECRET") ?? "";
  const cliente = clienteServicio();
  if (!secreto || !cliente) return json(503, { error: "El servicio no está configurado." });
  await expirar(cliente);
  const salida = await procesarAviso({
    cuerpo,
    encabezados: req.headers,
    secreto,
    base: baseAviso(cliente),
    confirmar: (id) => obtenerTransaccion(id),
  });
  return json(salida.estado, salida.cuerpo);
});
