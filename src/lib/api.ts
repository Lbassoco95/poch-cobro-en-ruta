export class ErrorDeApi extends Error {}

export async function llamar<T>(nombre: string, token: string, cuerpo?: unknown): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const llave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let respuesta: Response;
  try {
    respuesta = await fetch(`${url}/functions/v1/${nombre}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        apikey: llave,
        "content-type": "application/json",
      },
      body: cuerpo === undefined ? "{}" : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorDeApi("No hay conexión con el servidor. Intente de nuevo.");
  }
  const data = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const mensaje = typeof data?.error === "string" ? data.error : "No se pudo completar la acción.";
    throw new ErrorDeApi(mensaje);
  }
  return data as T;
}
