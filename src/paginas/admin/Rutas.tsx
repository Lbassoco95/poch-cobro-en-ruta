import { useEffect, useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { AvisosReorden } from "../../componentes/AvisosReorden";
import { Boton } from "../../componentes/Boton";
import { Lista } from "../../componentes/Lista";
import { CascaronAdmin } from "../../componentes/CascaronAdmin";
import { Insignia } from "../../componentes/Insignia";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";
import { etiqueta, pesos } from "../../lib/formato";
import { insigniaDeParada } from "../../lib/parada";
import { movimientosPorParada } from "../../lib/reorden";
import type { Tablero } from "../../lib/tipos";

type Catalogo = { productos: Array<{ id: string; nombre: string; sku: string; precio: number }> };
type Linea = { producto_id: string; cantidad: number; nombre: string };

export default function RutasAdmin() {
  const { sesion } = useSesion();
  const [datos, setDatos] = useState<Tablero | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo["productos"]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [repartidorId, setRepartidorId] = useState("");
  const [nombreRuta, setNombreRuta] = useState("Ruta del día");
  const [rutaId, setRutaId] = useState("");
  const [folio, setFolio] = useState("");
  const [cliente, setCliente] = useState("");
  const [ordenCompra, setOrdenCompra] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [lineas, setLineas] = useState<Linea[]>([]);

  function cargar() {
    if (!sesion) return;
    Promise.all([
      llamar<Tablero>("tablero", sesion.token),
      llamar<Catalogo>("catalogo", sesion.token),
    ])
      .then(([tablero, productos]) => {
        setDatos(tablero);
        setCatalogo(productos.productos ?? []);
        setRutaId((actual) => actual || tablero.rutas.find((ruta) => ruta.estado === "abierta")?.id || "");
        setRepartidorId((actual) => actual || tablero.repartidores[0]?.repartidor_id || "");
        setProductoId((actual) => actual || productos.productos?.[0]?.id || "");
      })
      .catch((fallo: unknown) => setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar."));
  }

  useEffect(() => {
    cargar();
  }, [sesion]);

  async function crearRuta() {
    if (!sesion || !repartidorId) return;
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
      const data = await llamar<{ ruta_id: string }>("crear-ruta", sesion.token, {
        operacion_id: crypto.randomUUID(),
        repartidor_id: repartidorId,
        nombre: nombreRuta,
        fecha,
      });
      setRutaId(data.ruta_id);
      setAviso("Ruta creada.");
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo crear la ruta.");
    } finally {
      setOcupado(false);
    }
  }

  function agregarLinea() {
    const producto = catalogo.find((item) => item.id === productoId);
    if (!producto || cantidad < 1) return;
    setLineas((prev) => [...prev, { producto_id: producto.id, cantidad, nombre: producto.nombre }]);
  }

  async function cargarDocumento() {
    if (!sesion || !rutaId) return;
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      if (!lineas.length) throw new ErrorDeApi("Agregue al menos una pieza.");
      await llamar("cargar-documento", sesion.token, {
        operacion_id: crypto.randomUUID(),
        ruta_id: rutaId,
        tipo: "remision",
        folio,
        cliente,
        orden_compra: ordenCompra || undefined,
        lineas: lineas.map((linea) => ({ producto_id: linea.producto_id, cantidad: linea.cantidad })),
      });
      setFolio("");
      setCliente("");
      setOrdenCompra("");
      setLineas([]);
      setAviso("Remisión cargada como última parada.");
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cargar el documento.");
    } finally {
      setOcupado(false);
    }
  }

  async function cerrar(ruta: string) {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const cierre = await llamar<{ entregados: number; devueltos: number; cobrado: number }>(
        "cerrar-ruta",
        sesion.token,
        { operacion_id: crypto.randomUUID(), ruta_id: ruta },
      );
      setAviso(
        `Ruta cerrada. ${cierre.entregados} entregados, ${cierre.devueltos} devueltos, cobrado ${pesos(cierre.cobrado)}.`,
      );
      cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo cerrar la ruta.");
    } finally {
      setOcupado(false);
    }
  }

  const nombres = new Map<string, string>();
  for (const ruta of datos?.rutas ?? []) {
    for (const parada of ruta.paradas) {
      if (parada.folio_documento) nombres.set(parada.folio_documento, parada.cliente);
    }
  }

  return (
    <CascaronAdmin actual="rutas">
      <h1>Remisiones y rutas</h1>
      <p className="muted">
        Las órdenes de compra se convierten en remisiones y se asignan a la ruta de un repartidor.
        Ninguna función devuelve la lista de órdenes pendientes: esta pantalla no inventa esa lista.
        Puede crear la ruta y cargar el documento con los datos que escriba.
      </p>
      <Aviso texto={error} />
      {aviso ? <Aviso tono="ok">{aviso}</Aviso> : null}
      <AvisosReorden filas={datos?.reordenamientos ?? []} nombres={nombres} />

      <h2 className="margen-top-lg">Crear ruta</h2>
      <div className="dos">
        <label htmlFor="rep-ruta">Repartidor
          <Lista
            id="rep-ruta"
            valor={repartidorId}
            alCambiar={setRepartidorId}
            opciones={(datos?.repartidores ?? []).map((rep) => ({ valor: rep.repartidor_id, texto: rep.nombre }))}
            placeholder="Elija un repartidor"
          />
        </label>
        <label htmlFor="nombre-ruta">Nombre
          <input id="nombre-ruta" value={nombreRuta} onChange={(evento) => setNombreRuta(evento.target.value)} />
        </label>
      </div>
      <div className="margen-top" style={{ maxWidth: 280 }}>
        <Boton ocupado={ocupado} onClick={() => void crearRuta()}>Crear ruta</Boton>
      </div>

      <h2 className="margen-top-lg">Cargar remisión en una ruta abierta</h2>
      <label htmlFor="ruta-doc">Ruta
        <Lista
          id="ruta-doc"
          valor={rutaId}
          alCambiar={setRutaId}
          placeholder="Elija una ruta"
          opciones={[
            { valor: "", texto: "Elija una ruta" },
            ...(datos?.rutas ?? [])
              .filter((ruta) => ruta.estado === "abierta")
              .map((ruta) => ({ valor: ruta.id, texto: `${ruta.nombre} · ${ruta.repartidor}` })),
          ]}
        />
      </label>
      <div className="dos margen-top">
        <label htmlFor="folio-doc">Folio de la remisión
          <input id="folio-doc" value={folio} onChange={(evento) => setFolio(evento.target.value)} />
        </label>
        <label htmlFor="oc-doc">Orden de compra
          <input id="oc-doc" value={ordenCompra} onChange={(evento) => setOrdenCompra(evento.target.value)} />
        </label>
        <label htmlFor="cliente-doc">Cliente
          <input id="cliente-doc" value={cliente} onChange={(evento) => setCliente(evento.target.value)} />
        </label>
      </div>
      <div className="acciones margen-top">
        <div style={{ flex: "1 1 220px", maxWidth: 320 }}>
          <Lista
            etiqueta="Pieza"
            valor={productoId}
            alCambiar={setProductoId}
            placeholder="Elija una pieza"
            opciones={catalogo.map((producto) => ({
              valor: producto.id,
              texto: `${producto.nombre} · ${pesos(producto.precio)}`,
            }))}
          />
        </div>
        <input aria-label="Cantidad" type="number" min={1} value={cantidad} onChange={(evento) => setCantidad(Number(evento.target.value))} style={{ maxWidth: 100 }} />
        <Boton chico variante="secundario" onClick={agregarLinea}>Agregar</Boton>
      </div>
      <ul>
        {lineas.map((linea, indice) => (
          <li key={`${linea.producto_id}-${indice}`}>{linea.cantidad} × {linea.nombre}</li>
        ))}
      </ul>
      <div className="margen-top" style={{ maxWidth: 320 }}>
        <Boton ocupado={ocupado} onClick={() => void cargarDocumento()}>Cargar como última parada</Boton>
      </div>

      <h2 className="margen-top-lg">Rutas del día</h2>
      <div className="dos">
        {(datos?.rutas ?? []).map((ruta) => {
          const marcas = movimientosPorParada(
            (datos?.reordenamientos ?? []).filter((fila) => !fila.detalle?.ruta_id || fila.detalle.ruta_id === ruta.id),
          );
          return (
            <article key={ruta.id} className="card">
              <div className="fila">
                <b>{ruta.repartidor}</b>
                <span className="muted">{ruta.paradas.length} paradas · {etiqueta(ruta.estado)}</span>
              </div>
              {ruta.estado === "abierta" ? (
                <div className="margen-top">
                  <Boton chico variante="secundario" ocupado={ocupado} onClick={() => void cerrar(ruta.id)}>Cerrar ruta</Boton>
                </div>
              ) : null}
              {ruta.paradas.map((parada) => {
                const marca = parada.folio_documento ? marcas.get(parada.folio_documento) : undefined;
                return (
                  <div key={parada.id} className="fila" style={{ padding: "10px 0", borderTop: "1px solid var(--linea)", alignItems: "flex-start" }}>
                    <div className="nombre">
                      <b>{parada.parada}. {parada.cliente}</b>
                      <div className="muted">
                        Remisión {parada.folio_documento ?? "—"}
                        {parada.orden_compra ? ` · ${parada.orden_compra}` : ""}
                        {" · "}
                        {pesos(parada.total)}
                      </div>
                      {marca ? (
                        <div className="claro">↕ Parada {marca.de} → {marca.a} (cambio del repartidor)</div>
                      ) : null}
                    </div>
                    <Insignia tipo={insigniaDeParada({ estado: parada.estado })} />
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
      {(datos?.rutas ?? []).length === 0 ? <p className="muted">No hay rutas para hoy.</p> : null}
    </CascaronAdmin>
  );
}
