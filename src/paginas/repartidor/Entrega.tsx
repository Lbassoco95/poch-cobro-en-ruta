import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CampoFirma, type FirmaControl } from "../../componentes/CampoFirma";
import { CampoFoto } from "../../componentes/CampoFoto";
import { CascaronRepartidor } from "../../componentes/CascaronRepartidor";
import { Insignia } from "../../componentes/Insignia";
import { Vidrio } from "../../componentes/Vidrio";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { comprimirFoto, huellaSha256 } from "../../lib/evidencia";
import { pesos } from "../../lib/formato";
import { textoPiezas } from "../../lib/parada";
import type { EstadoPedido } from "../../lib/tipos";

type Excepcion = "" | "recibio_tercero" | "cliente_no_firma" | "sin_foto";

const EXCEPCIONES: Array<{ valor: Excepcion; etiqueta: string }> = [
  { valor: "", etiqueta: "Sin excepción" },
  { valor: "recibio_tercero", etiqueta: "Recibió otra persona" },
  { valor: "cliente_no_firma", etiqueta: "El cliente no firma" },
  { valor: "sin_foto", etiqueta: "Sin foto" },
];

type Subida = {
  foto: { ruta: string; url: string; token: string };
  firma: { ruta: string; url: string; token: string };
};

export default function Entrega() {
  const { pedidoId = "" } = useParams();
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const firmaRef = useRef<FirmaControl>(null);
  const operacion = useRef(crypto.randomUUID());
  const [pedido, setPedido] = useState<EstadoPedido["pedido"] | null>(null);
  const [piezas, setPiezas] = useState(0);
  const [recibe, setRecibe] = useState("");
  const [foto, setFoto] = useState<Blob | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [hayFirma, setHayFirma] = useState(false);
  const [excepcion, setExcepcion] = useState<Excepcion>("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    llamar<EstadoPedido>("estado-pedido", sesion.token, { pedido_id: pedidoId })
      .then((data) => {
        setPedido(data.pedido);
        setPiezas(data.lineas.reduce((suma, linea) => suma + Number(linea.cantidad), 0));
        if (data.pedido.estado !== "pagado") {
          setError("Solo se entrega una remisión pagada.");
        }
      })
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo abrir la entrega."));
  }, [sesion, pedidoId]);

  useEffect(() => () => {
    if (vista) URL.revokeObjectURL(vista);
  }, [vista]);

  async function onFoto(archivo: File | null) {
    if (!archivo) return;
    try {
      const blob = await comprimirFoto(archivo);
      setFoto(blob);
      setVista((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior);
        return URL.createObjectURL(blob);
      });
      setError("");
    } catch (fallo) {
      setFoto(null);
      setError(fallo instanceof Error ? fallo.message : "No se pudo preparar la foto.");
    }
  }

  const faltaFoto = excepcion !== "sin_foto" && !foto;
  const faltaFirma = excepcion !== "cliente_no_firma" && !hayFirma;
  const faltaNombre = recibe.trim().length < 1;
  const faltaNota = Boolean(excepcion) && nota.trim().length < 5;
  const listo = !faltaFoto && !faltaFirma && !faltaNombre && !faltaNota;
  const faltantes = [
    faltaFoto ? "la foto" : "",
    faltaFirma ? "la firma" : "",
    faltaNombre ? "el nombre" : "",
    faltaNota ? "la nota de la excepción" : "",
  ].filter(Boolean);

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

  async function enviar() {
    if (!sesion || !listo) return;
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
        const firma = await firmaRef.current?.exportar();
        if (!firma) throw new ErrorDeApi("Falta la firma de quien recibe.");
        firmaHash = await huellaSha256(firma);
        await subir(firma, urls.firma.url, urls.firma.token, "image/png");
        firmaRuta = urls.firma.ruta;
      }
      await llamar("marcar-entregado", sesion.token, {
        operacion_id: operacion.current,
        pedido_id: pedidoId,
        recibe_nombre: recibe.trim(),
        foto_ruta: fotoRuta,
        foto_hash: fotoHash,
        firma_ruta: firmaRuta,
        firma_hash: firmaHash,
        excepcion: excepcion || null,
        nota: excepcion ? nota.trim() : null,
      });
      setFoto(null);
      setVista((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior);
        return null;
      });
      firmaRef.current?.limpiar();
      navegar(`/repartidor/estado/${pedidoId}`, { replace: true });
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo registrar la entrega.");
      operacion.current = crypto.randomUUID();
      setOcupado(false);
    }
  }

  return (
    <CascaronRepartidor titulo="Confirmar entrega" atras={`/repartidor/estado/${pedidoId}`}>
      <div className="pad">
        <Aviso texto={error} />
        {pedido ? (
          <Vidrio>
            <div className="fila">
              <b>Remisión {pedido.folio_documento ?? pedido.folio}</b>
              <Insignia tipo="pagado" />
            </div>
            <div className="muted">{pedido.cliente_alias} · {textoPiezas(piezas)} · {pesos(pedido.total)}</div>
          </Vidrio>
        ) : null}
        <h3>1. Foto de las piezas entregadas</h3>
        <CampoFoto vista={vista} alArchivo={(archivo) => void onFoto(archivo)} />
        <h3>2. Firma de quien recibe</h3>
        <Vidrio>
          <CampoFirma ref={firmaRef} alCambiar={setHayFirma} />
          <div className="fila margen-top">
            <span className="muted">Firme con el dedo dentro del recuadro.</span>
            <Boton variante="secundario" chico onClick={() => firmaRef.current?.limpiar()}>Borrar</Boton>
          </div>
        </Vidrio>
        <h3>3. Nombre de quien recibe</h3>
        <label htmlFor="recibe">
          Nombre
          <input id="recibe" value={recibe} onChange={(evento) => setRecibe(evento.target.value)} autoComplete="name" required />
        </label>
        <h3 className="margen-top">Excepción</h3>
        <div className="grupo" role="group" aria-label="Excepción de entrega">
          {EXCEPCIONES.map((item) => (
            <button
              key={item.etiqueta}
              type="button"
              className="chip"
              aria-pressed={excepcion === item.valor}
              onClick={() => setExcepcion(item.valor)}
            >
              {item.etiqueta}
            </button>
          ))}
        </div>
        {excepcion ? (
          <>
            <Aviso tono="ambar">Quedará para revisión de administración.</Aviso>
            <label htmlFor="nota-ex">
              Nota (mínimo 5 caracteres)
              <textarea id="nota-ex" value={nota} onChange={(evento) => setNota(evento.target.value)} />
            </label>
          </>
        ) : null}
        <Aviso tono="info">
          La foto debe mostrar las piezas, no a personas. La firma solo sirve para confirmar esta entrega.
        </Aviso>
        <Boton variante="entrega" disabled={!listo} ocupado={ocupado} onClick={() => void enviar()}>
          ✔ Confirmar entrega
        </Boton>
        <p className="muted" style={{ textAlign: "center" }}>
          {faltantes.length ? `Falta ${faltantes.join(", ")}.` : "Todo listo para confirmar."}
        </p>
      </div>
    </CascaronRepartidor>
  );
}
