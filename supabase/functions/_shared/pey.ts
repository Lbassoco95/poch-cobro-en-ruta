const BASE = "https://api.pey.mx";

export type TransaccionLista = {
  id: string;
  status: string;
  amount: number;
  payableType: string;
  description?: string;
  datePaid?: number;
  dateCreated?: number;
  metadata?: unknown;
};

function llave(): string {
  const valor = Deno.env.get("PEY_API_KEY") ?? "";
  if (!valor) throw new Error("PEY_NO_CONFIGURADO");
  return valor;
}

function cuenta(): string {
  const valor = Deno.env.get("PEY_BANK_ACCOUNT_ID") ?? "";
  if (!valor) throw new Error("PEY_NO_CONFIGURADO");
  return valor;
}

async function pedir(ruta: string, metodo: string, cuerpo?: unknown): Promise<{ estado: number; json: unknown }> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${llave()}`,
        "content-type": "application/json",
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("PEY_NO_DISPONIBLE");
  }
  if (respuesta.status === 503) throw new Error("PEY_NO_DISPONIBLE");
  let json: unknown = null;
  try {
    json = await respuesta.json();
  } catch {
    json = null;
  }
  return { estado: respuesta.status, json };
}

export async function crearQr(datos: {
  amount: number;
  concept: string;
  numRef: string;
  intentoId: string;
  cobroId: string;
}): Promise<{ id: string; qrString: string; qrImage: string | null }> {
  if (datos.amount <= 0) throw new Error("PEY_RECHAZO");
  const { estado, json } = await pedir("/codi/qr", "POST", {
    amount: datos.amount,
    concept: datos.concept,
    expiration: 360,
    numRef: datos.numRef,
    generateImage: true,
    bankAccountId: cuenta(),
    metadata: { intento_id: datos.intentoId, cobro_id: datos.cobroId },
  });
  if (estado !== 201 && estado !== 200) throw new Error("PEY_RECHAZO");
  const cuerpo = objeto(json);
  if (typeof cuerpo.id !== "string" || typeof cuerpo.qrString !== "string") throw new Error("PEY_RECHAZO");
  return {
    id: cuerpo.id,
    qrString: cuerpo.qrString,
    qrImage: typeof cuerpo.qrImage === "string" ? cuerpo.qrImage : null,
  };
}

export async function crearAviso(datos: {
  amount: number;
  concept: string;
  numRef: string;
  celular: string;
  intentoId: string;
  cobroId: string;
}): Promise<{ transactionId: string; codiId: string }> {
  if (datos.amount <= 0) throw new Error("PEY_RECHAZO");
  const { estado, json } = await pedir("/codi/pn", "POST", {
    amount: datos.amount,
    phoneNumber: datos.celular,
    concept: datos.concept,
    expiration: 360,
    numRef: datos.numRef,
    bankAccountId: cuenta(),
    metadata: { intento_id: datos.intentoId, cobro_id: datos.cobroId },
  });
  if (estado !== 201 && estado !== 200) throw new Error("PEY_RECHAZO");
  const cuerpo = objeto(json);
  if (typeof cuerpo.transactionId !== "string") throw new Error("PEY_RECHAZO");
  return {
    transactionId: cuerpo.transactionId,
    codiId: typeof cuerpo.codiId === "string" ? cuerpo.codiId : "",
  };
}

export async function obtenerTransaccion(id: string): Promise<{ status: string; amount: number } | null> {
  const { estado, json } = await pedir(`/transaction/${encodeURIComponent(id)}`, "GET");
  if (estado === 404) return null;
  if (estado !== 200) throw new Error("PEY_NO_DISPONIBLE");
  const cuerpo = objeto(json);
  if (typeof cuerpo.status !== "string" || typeof cuerpo.amount !== "number") return null;
  return { status: cuerpo.status, amount: cuerpo.amount };
}

export async function listarTransacciones(nextToken?: string | null): Promise<{
  items: TransaccionLista[];
  nextToken: string | null;
}> {
  const ruta = nextToken ? `/transaction/api-key?nextToken=${encodeURIComponent(nextToken)}` : "/transaction/api-key";
  const { estado, json } = await pedir(ruta, "GET");
  if (estado !== 200) throw new Error("PEY_NO_DISPONIBLE");
  const cuerpo = objeto(json);
  const items = Array.isArray(cuerpo.items) ? cuerpo.items.filter(esTransaccion) : [];
  return { items, nextToken: typeof cuerpo.nextToken === "string" ? cuerpo.nextToken : null };
}

function esTransaccion(valor: unknown): valor is TransaccionLista {
  if (!valor || typeof valor !== "object") return false;
  const fila = valor as Record<string, unknown>;
  return typeof fila.id === "string" && typeof fila.status === "string" && typeof fila.amount === "number" &&
    typeof fila.payableType === "string";
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
}
