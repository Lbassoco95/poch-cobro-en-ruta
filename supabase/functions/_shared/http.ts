import { responderError } from "./errores.ts";

const LIMITE = 32_768;

export function json(estado: number, cuerpo: unknown, origen: string | null = null): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  });
  if (origen) {
    headers.set("access-control-allow-origin", origen);
    headers.set("vary", "origin");
  }
  return new Response(JSON.stringify(cuerpo), { status: estado, headers });
}

export function origenPermitido(req: Request): string | null {
  const sitio = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const origen = req.headers.get("origin");
  if (!origen) return null;
  if (sitio && origen === sitio) return origen;
  if (!sitio && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origen)) return origen;
  return null;
}

function cors(origen: string | null): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-max-age": "86400",
  });
  if (origen) headers.set("access-control-allow-origin", origen);
  return headers;
}

export function servir(manejador: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    const origen = origenPermitido(req);
    const traeOrigen = Boolean(req.headers.get("origin"));
    if (req.method === "OPTIONS") {
      if (traeOrigen && !origen) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origen) });
    }
    if (traeOrigen && !origen) return json(403, { error: "Origen no permitido." });
    try {
      const respuesta = await manejador(req);
      const headers = new Headers(respuesta.headers);
      if (origen) {
        headers.set("access-control-allow-origin", origen);
        headers.set("vary", "origin");
      }
      headers.set("x-content-type-options", "nosniff");
      headers.set("cache-control", "no-store");
      return new Response(respuesta.body, { status: respuesta.status, headers });
    } catch (error) {
      const traducido = responderError(error);
      const cuerpo: Record<string, unknown> = { error: traducido.error };
      if (traducido.segundos_restantes !== undefined) {
        cuerpo.segundos_restantes = traducido.segundos_restantes;
        cuerpo.codigo = "INTENTO_VIGENTE";
      }
      return json(traducido.estado, cuerpo, origen);
    }
  });
}

export async function leerJson(req: Request): Promise<unknown> {
  const anunciado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(anunciado) && anunciado > LIMITE) throw new Error("SOLICITUD_INVALIDA");
  const texto = await req.text();
  if (texto.length > LIMITE) throw new Error("SOLICITUD_INVALIDA");
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error("SOLICITUD_INVALIDA");
  }
}
