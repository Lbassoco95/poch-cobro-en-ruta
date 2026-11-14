const BASE = "https://api.pey.mx";

export type TransaccionQr = {
  id: string;
  status: string;
  amount: number;
  currency?: string;
  datePaid?: number;
  dateCreated?: number;
  description?: string;
  paymentMethod?: string;
  metadata?: unknown;
  amountBreakdown?: { base?: number };
};

function llave(): string {
  const valor = Deno.env.get("PEY_API_KEY") ?? "";
  if (!valor) throw new Error("PEY_NO_CONFIGURADO");
  return valor;
}

/** Solo si la llave NO está ligada a una cuenta. Si se manda mal, pey responde BANK_ACCOUNT_NOT_FOUND. */
function cuentaOpcional(): string | undefined {
  const valor = (Deno.env.get("PEY_BANK_ACCOUNT_ID") ?? "").trim();
  return valor || undefined;
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

function cuerpoCreacion(datos: {
  amount: number;
  concept: string;
  numRef: string;
  intentoId: string;
  cobroId: string;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    amount: datos.amount,
    concept: datos.concept,
    expiration: 360,
    numRef: datos.numRef,
    metadata: { intento_id: datos.intentoId, cobro_id: datos.cobroId },
    ...datos.extras,
  };
  const cuenta = cuentaOpcional();
  if (cuenta) cuerpo.bankAccountId = cuenta;
  return cuerpo;
}

export async function crearQr(datos: {
  amount: number;
  concept: string;
  numRef: string;
  intentoId: string;
  cobroId: string;
}): Promise<{ id: string; qrString: string; qrImage: string | null }> {
  if (datos.amount <= 0) throw new Error("PEY_RECHAZO");
  const { estado, json } = await pedir("/codi/qr", "POST", cuerpoCreacion({
    ...datos,
    extras: { generateImage: true },
  }));
  if (estado !== 201 && estado !== 200) throw new Error("PEY_RECHAZO");
  const cuerpo = objeto(json);
  // Verificado con pago real: la respuesta solo trae id (del QR), qrString y qrImage. Sin transactionId.
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
}): Promise<{ id: string; codiId: string | null }> {
  if (datos.amount <= 0) throw new Error("PEY_RECHAZO");
  const { estado, json } = await pedir("/codi/pn", "POST", cuerpoCreacion({
    amount: datos.amount,
    concept: datos.concept,
    numRef: datos.numRef,
    intentoId: datos.intentoId,
    cobroId: datos.cobroId,
    extras: { phoneNumber: datos.celular },
  }));
  if (estado !== 201 && estado !== 200) throw new Error("PEY_RECHAZO");
  const cuerpo = objeto(json);
  const id = typeof cuerpo.codiId === "string"
    ? cuerpo.codiId
    : typeof cuerpo.id === "string"
    ? cuerpo.id
    : typeof cuerpo.transactionId === "string"
    ? cuerpo.transactionId
    : null;
  if (!id) throw new Error("PEY_RECHAZO");
  return {
    id,
    codiId: typeof cuerpo.codiId === "string" ? cuerpo.codiId : null,
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

/** Conciliación por QR: lista vacía = aún no se pagó. Verificado con pago real el 14-nov-2026. */
export async function listarTransaccionesDeQr(qrId: string, nextToken?: string | null): Promise<{
  items: TransaccionQr[];
  nextToken: string | null;
}> {
  const base = `/transaction/codi/qr/${encodeURIComponent(qrId)}`;
  const ruta = nextToken ? `${base}?nextToken=${encodeURIComponent(nextToken)}` : base;
  const { estado, json } = await pedir(ruta, "GET");
  if (estado !== 200) throw new Error("PEY_NO_DISPONIBLE");
  const cuerpo = objeto(json);
  const items = Array.isArray(cuerpo.items) ? cuerpo.items.filter(esTransaccionQr) : [];
  return { items, nextToken: typeof cuerpo.nextToken === "string" ? cuerpo.nextToken : null };
}

function esTransaccionQr(valor: unknown): valor is TransaccionQr {
  if (!valor || typeof valor !== "object") return false;
  const fila = valor as Record<string, unknown>;
  return typeof fila.id === "string" && typeof fila.status === "string" && typeof fila.amount === "number";
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
}
