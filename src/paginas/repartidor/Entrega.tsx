import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Aviso, Boton, Marco } from "../../componentes/Marco";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { comprimirFoto, huellaSha256 } from "../../lib/evidencia";

type Subida = {
  foto: { ruta: string; url: string; token: string };
  firma: { ruta: string; url: string; token: string };
};

export default function Entrega() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const operacion = useRef(crypto.randomUUID());
  const [recibe, setRecibe] = useState("");
  const [foto, setFoto] = useState<Blob | null>(null);
  const [excepcion, setExcepcion] = useState<"" | "recibio_tercero" | "cliente_no_firma" | "sin_foto">("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [coords, setCoords] = useState<{ latitud: number; longitud: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    const canvas = lienzoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0B2545";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    function punto(evento: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return {
        x: (evento.clientX - rect.left) * (canvas!.width / rect.width),
        y: (evento.clientY - rect.top) * (canvas!.height / rect.height),
      };
    }
    function abajo(evento: PointerEvent) {
      dibujando.current = true;
      const p = punto(evento);
      ctx!.beginPath();
      ctx!.moveTo(p.x, p.y);
      canvas!.setPointerCapture(evento.pointerId);
    }
    function mover(evento: PointerEvent) {
      if (!dibujando.current) return;
      const p = punto(evento);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
    }
    function arriba() {
      dibujando.current = false;
    }
    canvas.addEventListener("pointerdown", abajo);
    canvas.addEventListener("pointermove", mover);
    canvas.addEventListener("pointerup", arriba);
    canvas.addEventListener("pointercancel", arriba);
    return () => {
      canvas.removeEventListener("pointerdown", abajo);
      canvas.removeEventListener("pointermove", mover);
      canvas.removeEventListener("pointerup", arriba);
      canvas.removeEventListener("pointercancel", arriba);
    };
  }, []);

  function borrarFirma() {
    const canvas = lienzoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function onFoto(archivo: File | null) {
    if (!archivo) return;
    try {
      setFoto(await comprimirFoto(archivo));
    } catch {
      setError("No se pudo preparar la foto.");
    }
  }

  async function subir(blob: Blob, url: string, token: string, tipo: string) {
    const respuesta = await fetch(url, {
      method: "PUT",
      headers: {
        "content-type": tipo,
        "x-upsert": "true",
        authorization: `Bearer ${token}`,
      },
      body: blob,
    });
    if (!respuesta.ok) throw new ErrorDeApi("No se pudo subir la evidencia.");
  }

  async function firmarCanvas(): Promise<Blob> {
    const canvas = lienzoRef.current;
    if (!canvas) throw new ErrorDeApi("Falta la firma.");
    const blob = await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, "image/png"));
    if (!blob) throw new ErrorDeApi("No se pudo exportar la firma.");
    return blob;
  }

  async function enviar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const urls = await llamar<Subida>("subir-evidencia", sesion.token, { pedido_id: pedidoId });
      let fotoRuta: string | null = null;
      let fotoHash: string | null = null;
      let firmaRuta: string | null = null;
      let firmaHash: string | null = null;

      if (excepcion !== "sin_foto") {
        if (!foto) throw new ErrorDeApi("Tome una foto de las piezas entregadas.");
        fotoHash = await huellaSha256(foto);
        await subir(foto, urls.foto.url, urls.foto.token, "image/jpeg");
        fotoRuta = urls.foto.ruta;
      }
      if (excepcion !== "cliente_no_firma") {
        const firma = await firmarCanvas();
        firmaHash = await huellaSha256(firma);
        await subir(firma, urls.firma.url, urls.firma.token, "image/png");
        firmaRuta = urls.firma.ruta;
      }

      await llamar("marcar-entregado", sesion.token, {
        operacion_id: operacion.current,
        pedido_id: pedidoId,
        recibe_nombre: recibe,
        foto_ruta: fotoRuta,
        foto_hash: fotoHash,
        firma_ruta: firmaRuta,
        firma_hash: firmaHash,
        excepcion: excepcion || null,
        nota: excepcion ? nota : null,
        latitud: coords?.latitud ?? null,
        longitud: coords?.longitud ?? null,
      });
      navegar("/repartidor");
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo registrar la entrega.");
      operacion.current = crypto.randomUUID();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Marco titulo="Entrega" enlaces={[{ a: "/repartidor", texto: "Mi ruta" }]}>
      <Aviso texto={error} />
      <p className="rounded-2xl border border-linea bg-white px-4 py-3 text-sm" role="note">
        La foto debe mostrar las piezas entregadas, no a personas. La firma solo confirma esta entrega.
        La foto y la firma sirven como constancia de entrega. No son firma electrónica avanzada.
      </p>
      <label className="mt-4 block text-sm font-medium" htmlFor="recibe">
        Nombre de quien recibe
        <input id="recibe" value={recibe} onChange={(e) => setRecibe(e.target.value)} required className="mt-1 min-h-14 w-full rounded-2xl border border-linea px-4 text-lg" />
      </label>
      <label className="mt-4 block text-sm font-medium" htmlFor="foto">
        Foto de las piezas
        <input id="foto" type="file" accept="image/*" capture="environment" onChange={(e) => void onFoto(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
      </label>
      {foto && <p className="mt-1 text-sm text-jade">Foto lista ({Math.round(foto.size / 1024)} KB)</p>}
      <p className="mt-4 text-sm font-medium">Firma en pantalla</p>
      <canvas ref={lienzoRef} width={600} height={240} className="mt-1 w-full touch-none rounded-2xl border border-linea bg-white" />
      <button type="button" onClick={borrarFirma} className="mt-2 text-sm font-medium text-jade">Borrar firma</button>
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Excepción (opcional)</legend>
        <select value={excepcion} onChange={(e) => setExcepcion(e.target.value as typeof excepcion)} className="mt-1 min-h-12 w-full rounded-xl border border-linea px-3">
          <option value="">Sin excepción</option>
          <option value="recibio_tercero">Recibió otra persona</option>
          <option value="cliente_no_firma">El cliente no quiere firmar</option>
          <option value="sin_foto">No pude tomar foto</option>
        </select>
      </fieldset>
      {excepcion && (
        <>
          <p className="mt-2 rounded-2xl bg-ambar-fondo px-4 py-3 text-sm text-ambar">Quedará para revisión del administrador.</p>
          <label className="mt-2 block text-sm font-medium" htmlFor="nota-ex">
            Nota
            <textarea id="nota-ex" value={nota} onChange={(e) => setNota(e.target.value)} className="mt-1 min-h-20 w-full rounded-2xl border border-linea px-3 py-2" />
          </label>
        </>
      )}
      <div className="mt-6">
        <Boton onClick={() => void enviar()} ocupado={ocupado}>Registrar entrega</Boton>
      </div>
    </Marco>
  );
}
