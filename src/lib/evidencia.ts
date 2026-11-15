/** Una foto de celular puede pesar más de 5 MB: se comprime antes de subirla, así que no se limita el original. */
export function validarFoto(archivo: File): void {
  if (!archivo.type.startsWith("image/")) {
    throw new Error("Elija una foto (imagen JPEG, PNG o WebP).");
  }
}

export async function huellaSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digesto = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digesto), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const LADO_MAXIMO = 1600;
const OBJETIVO_BYTES = 1_500_000;
const LIMITE_BYTES = 5 * 1024 * 1024;

function aJpeg(lienzo: HTMLCanvasElement, calidad: number): Promise<Blob | null> {
  return new Promise((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
}

/** Reduce la foto en el navegador: JPEG de máximo 1600 px por lado, calidad 0.8, objetivo menor a 1.5 MB. */
export async function comprimirFoto(archivo: File): Promise<Blob> {
  validarFoto(archivo);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new Error("No se pudo leer la foto. Tome otra en formato JPEG o PNG.");
  }
  let lado = LADO_MAXIMO;
  let blob: Blob | null = null;
  try {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
      lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
      const ctx = lienzo.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar la foto.");
      ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
      let calidad = 0.8;
      blob = await aJpeg(lienzo, calidad);
      while (blob && blob.size > OBJETIVO_BYTES && calidad > 0.5) {
        calidad = Math.round((calidad - 0.1) * 10) / 10;
        blob = await aJpeg(lienzo, calidad);
      }
      if (blob && blob.size <= OBJETIVO_BYTES) break;
      lado = Math.round(lado * 0.8);
    }
  } finally {
    bitmap.close();
  }
  if (!blob) throw new Error("No se pudo comprimir la foto.");
  if (blob.size > LIMITE_BYTES) {
    throw new Error("La foto pesa más de 5 MB aun comprimida. Tome otra con menos resolución.");
  }
  return blob;
}
