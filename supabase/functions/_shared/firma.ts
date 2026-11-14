const PREFIJO = "whsec_";
const TOLERANCIA_SEGUNDOS = 5 * 60;

export type ResultadoFirma = {
  ok: boolean;
  motivo?: "encabezados" | "tiempo" | "firma";
  webhookId?: string;
};

export async function verificarFirma(
  cuerpo: string,
  encabezados: Headers,
  secreto: string,
  ahoraSegundos = Math.floor(Date.now() / 1000),
): Promise<ResultadoFirma> {
  const id = encabezados.get("webhook-id") ?? undefined;
  const marca = encabezados.get("webhook-timestamp");
  const firma = encabezados.get("webhook-signature");
  if (!id || !marca || !firma || !secreto) return { ok: false, motivo: "encabezados", webhookId: id };
  const tiempo = Number(marca);
  if (!Number.isFinite(tiempo) || Math.abs(ahoraSegundos - tiempo) > TOLERANCIA_SEGUNDOS) {
    return { ok: false, motivo: "tiempo", webhookId: id };
  }
  const esperado = await firmar(secreto, `${id}.${marca}.${cuerpo}`);
  const coincide = firma.split(" ").some((parte) => {
    const coma = parte.indexOf(",");
    if (coma < 0) return false;
    const version = parte.slice(0, coma);
    const valor = parte.slice(coma + 1);
    return version === "v1" && igual(valor, esperado);
  });
  return coincide ? { ok: true, webhookId: id } : { ok: false, motivo: "firma", webhookId: id };
}

async function firmar(secreto: string, contenido: string): Promise<string> {
  const limpio = secreto.startsWith(PREFIJO) ? secreto.slice(PREFIJO.length) : secreto;
  const clave = await crypto.subtle.importKey(
    "raw",
    desdeBase64(limpio),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(contenido));
  return aBase64(new Uint8Array(mac));
}

function desdeBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

function aBase64(bytes: Uint8Array): string {
  let texto = "";
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto);
}

function igual(a: string, b: string): boolean {
  const uno = new TextEncoder().encode(a);
  const dos = new TextEncoder().encode(b);
  if (uno.length !== dos.length) return false;
  let diferencia = 0;
  for (let i = 0; i < uno.length; i++) diferencia |= uno[i] ^ dos[i];
  return diferencia === 0;
}
