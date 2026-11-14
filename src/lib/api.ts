export class ErrorDeApi extends Error {
  codigo?: string;
  segundosRestantes?: number;
  constructor(mensaje: string, extras?: { codigo?: string; segundosRestantes?: number }) {
    super(mensaje);
    this.codigo = extras?.codigo;
    this.segundosRestantes = extras?.segundosRestantes;
  }
}

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
    throw new ErrorDeApi(mensaje, {
      codigo: typeof data?.codigo === "string" ? data.codigo : undefined,
      segundosRestantes: typeof data?.segundos_restantes === "number" ? data.segundos_restantes : undefined,
    });
  }
  return data as T;
}
