const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMREF = /^[0-9]{1,7}$/;

export type DatosPago = {
  completo: boolean;
  motivo: "incompleto" | "sin_cobro" | null;
  amount: number | null;
  type: string | null;
  datePaid: string | null;
  transactionId: string | null;
  numRef: string | null;
  concept: string | null;
  intentoId: string | null;
  cobroId: string | null;
  via: "intento_id" | "num_ref" | null;
  banco: string | null;
  clabe4: string | null;
  rastreo: string | null;
};

function vacio(motivo: "incompleto" | "sin_cobro"): DatosPago {
  return {
    completo: false,
    motivo,
    amount: null,
    type: null,
    datePaid: null,
    transactionId: null,
    numRef: null,
    concept: null,
    intentoId: null,
    cobroId: null,
    via: null,
    banco: null,
    clabe4: null,
    rastreo: null,
  };
}

export function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function uuidDe(valor: unknown): string | null {
  return typeof valor === "string" && UUID.test(valor) ? valor : null;
}

function fechaUnix(valor: unknown): string | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  if (valor < 1_000_000_000 || valor > 10_000_000_000) return null;
  return new Date(valor * 1000).toISOString();
}

export function ultimos4(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 4) return null;
  return digitos.slice(-4);
}

export function extraerDatosPago(payload: unknown): DatosPago {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return vacio("incompleto");
  const cuerpo = payload as Record<string, unknown>;
  const amount = typeof cuerpo.amount === "number" && Number.isFinite(cuerpo.amount) && cuerpo.amount > 0
    ? redondear(cuerpo.amount)
    : null;
  const type = typeof cuerpo.type === "string" && cuerpo.type.length > 0 ? cuerpo.type : null;
  const datePaid = fechaUnix(cuerpo.datePaid);
  const transactionId = typeof cuerpo.transactionId === "string" && cuerpo.transactionId.length > 0
    ? cuerpo.transactionId
    : null;
  const concept = typeof cuerpo.concept === "string" ? cuerpo.concept.slice(0, 200) : null;
  const meta = objeto(cuerpo.metadata);
  const externo = objeto(meta.externalMetadata);
  const intentoId = uuidDe(externo.intento_id);
  const cobroId = uuidDe(externo.cobro_id);
  const numRef = typeof cuerpo.numRef === "string" && NUMREF.test(cuerpo.numRef) ? cuerpo.numRef : null;
  const banco = meta.bankCode === undefined || meta.bankCode === null ? null : String(meta.bankCode).slice(0, 20);
  const clabe4 = ultimos4(meta.clabe);
  const rastreo = typeof meta.trackingKey === "string" ? meta.trackingKey.slice(0, 80) : null;
  const comun = { amount, type, datePaid, transactionId, concept, intentoId, cobroId, numRef, banco, clabe4, rastreo };

  if (amount === null || !type || !datePaid || !transactionId) {
    return { ...vacio("incompleto"), ...comun };
  }
  if (!intentoId && !numRef) {
    return { ...vacio("sin_cobro"), ...comun };
  }
  return { ...comun, completo: true, motivo: null, via: intentoId ? "intento_id" : "num_ref" };
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
}

export function payloadSinClabe(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return { aviso: "sin_objeto" };
  const copia = structuredClone(payload) as Record<string, unknown>;
  const meta = copia.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const registro = meta as Record<string, unknown>;
    if ("clabe" in registro) registro.clabe = ultimos4(registro.clabe) ?? "";
  }
  return copia;
}
