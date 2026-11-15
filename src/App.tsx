import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { FondoVivo } from "./componentes/FondoVivo";
import { SesionProvider, useSesion } from "./contexto/Sesion";
import Detalle from "./paginas/admin/Detalle";
import Integridad from "./paginas/admin/Integridad";
import Pagos from "./paginas/admin/Pagos";
import RutasAdmin from "./paginas/admin/Rutas";
import Tablero from "./paginas/admin/Tablero";
import ComprobanteCliente from "./paginas/ComprobanteCliente";
import Ingreso from "./paginas/Ingreso";
import Cobrar from "./paginas/repartidor/Cobrar";
import Entrega from "./paginas/repartidor/Entrega";
import EstadoCobro from "./paginas/repartidor/EstadoCobro";
import Historial from "./paginas/repartidor/Historial";
import MiRuta from "./paginas/repartidor/MiRuta";
import Orden from "./paginas/repartidor/Orden";
import Remision from "./paginas/repartidor/Remision";

const Estilo = import.meta.env.DEV ? lazy(() => import("./paginas/admin/Estilo")) : null;

function RutaPrivada({ rol }: { rol: "repartidor" | "admin" }) {
  const { cargando, sesion } = useSesion();
  if (cargando) {
    return (
      <div className="stage">
        <p className="pad" role="status">Cargando…</p>
      </div>
    );
  }
  if (!sesion) return <Navigate to="/" replace />;
  if (sesion.rol !== rol) return <Navigate to={sesion.rol === "admin" ? "/admin" : "/repartidor"} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <SesionProvider>
      <FondoVivo />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Ingreso />} />
          <Route path="/c/:clave" element={<ComprobanteCliente />} />
          {Estilo ? (
            <Route path="/estilo" element={<Suspense fallback={null}><Estilo publico /></Suspense>} />
          ) : null}
          <Route element={<RutaPrivada rol="repartidor" />}>
            <Route path="/repartidor" element={<MiRuta />} />
            <Route path="/repartidor/historial" element={<Historial />} />
            <Route path="/repartidor/orden" element={<Orden />} />
            <Route path="/repartidor/parada/:pedidoId" element={<Remision />} />
            <Route path="/repartidor/cobrar/:pedidoId" element={<Cobrar />} />
            <Route path="/repartidor/estado/:pedidoId" element={<EstadoCobro />} />
            <Route path="/repartidor/entrega/:pedidoId" element={<Entrega />} />
          </Route>
          <Route element={<RutaPrivada rol="admin" />}>
            <Route path="/admin" element={<Tablero />} />
            <Route path="/admin/rutas" element={<RutasAdmin />} />
            <Route path="/admin/remisiones" element={<Navigate to="/admin/rutas" replace />} />
            <Route path="/admin/pagos" element={<Pagos />} />
            <Route path="/admin/bitacora" element={<Integridad />} />
            {Estilo ? (
              <Route path="/admin/estilo" element={<Suspense fallback={null}><Estilo /></Suspense>} />
            ) : null}
            <Route path="/admin/pedido/:pedidoId" element={<Detalle />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
