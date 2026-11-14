export async function huellaSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digesto = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digesto), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comprime una foto a JPEG ≤ 1600 px y cerca de 1 MB. */
export async function comprimirFoto(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const max = 1600;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la foto.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  let calidad = 0.85;
  let blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
  while (blob && blob.size > 1_000_000 && calidad > 0.4) {
    calidad -= 0.1;
    blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
  }
  if (!blob) throw new Error("No se pudo comprimir la foto.");
  return blob;
}
