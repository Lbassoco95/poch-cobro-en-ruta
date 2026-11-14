import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { SesionProvider, useSesion } from "./contexto/Sesion";
import Detalle from "./paginas/admin/Detalle";
import Pagos from "./paginas/admin/Pagos";
import Tablero from "./paginas/admin/Tablero";
import ComprobanteCliente from "./paginas/ComprobanteCliente";
import Ingreso from "./paginas/Ingreso";
import Camioneta from "./paginas/repartidor/Camioneta";
import Cobrar from "./paginas/repartidor/Cobrar";
import NuevoPedido from "./paginas/repartidor/NuevoPedido";
import Pagado from "./paginas/repartidor/Pagado";
import Pedidos from "./paginas/repartidor/Pedidos";

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
            <Route path="/repartidor" element={<Pedidos />} />
            <Route path="/repartidor/nuevo" element={<NuevoPedido />} />
            <Route path="/repartidor/cobrar/:pedidoId" element={<Cobrar />} />
            <Route path="/repartidor/pagado/:pedidoId" element={<Pagado />} />
            <Route path="/repartidor/camioneta" element={<Camioneta />} />
          </Route>
          <Route element={<RutaPrivada rol="admin" />}>
            <Route path="/admin" element={<Tablero />} />
            <Route path="/admin/pedido/:pedidoId" element={<Detalle />} />
            <Route path="/admin/pagos" element={<Pagos />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
