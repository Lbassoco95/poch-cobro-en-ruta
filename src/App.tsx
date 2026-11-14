import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { SesionProvider, useSesion } from "./contexto/Sesion";
import Detalle from "./paginas/admin/Detalle";
import Pagos from "./paginas/admin/Pagos";
import Remisiones from "./paginas/admin/Remisiones";
import Tablero from "./paginas/admin/Tablero";
import ComprobanteCliente from "./paginas/ComprobanteCliente";
import Ingreso from "./paginas/Ingreso";
import Entrega from "./paginas/repartidor/Entrega";
import Historial from "./paginas/repartidor/Historial";
import MiRuta from "./paginas/repartidor/MiRuta";
import Parada from "./paginas/repartidor/Parada";

function RutaPrivada({ rol }: { rol: "repartidor" | "admin" }) {
  const { cargando, sesion } = useSesion();
  if (cargando) return <p className="p-6 text-lg">Cargando…</p>;
  if (!sesion) return <Navigate to="/" replace />;
  if (sesion.rol !== rol) return <Navigate to={sesion.rol === "admin" ? "/admin" : "/repartidor"} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Ingreso />} />
          <Route path="/c/:clave" element={<ComprobanteCliente />} />
          <Route element={<RutaPrivada rol="repartidor" />}>
            <Route path="/repartidor" element={<MiRuta />} />
            <Route path="/repartidor/historial" element={<Historial />} />
            <Route path="/repartidor/parada/:pedidoId" element={<Parada />} />
            <Route path="/repartidor/entrega/:pedidoId" element={<Entrega />} />
          </Route>
          <Route element={<RutaPrivada rol="admin" />}>
            <Route path="/admin" element={<Tablero />} />
            <Route path="/admin/remisiones" element={<Remisiones />} />
            <Route path="/admin/pedido/:pedidoId" element={<Detalle />} />
            <Route path="/admin/pagos" element={<Pagos />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
