import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Pie } from "../componentes/Pie";
import { Aviso, Boton } from "../componentes/Marco";
import { useSesion } from "../contexto/Sesion";

export default function Ingreso() {
  const { configurado, cargando, sesion, error, entrar } = useSesion();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ocupado, setOcupado] = useState(false);

  if (cargando) return <p className="p-6 text-lg">Cargando…</p>;
  if (sesion?.rol === "repartidor") return <Navigate to="/repartidor" replace />;
  if (sesion?.rol === "admin") return <Navigate to="/admin" replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    await entrar(correo.trim(), contrasena);
    setOcupado(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <p className="text-sm font-semibold text-jade">Poch</p>
      <h1 className="mt-1 text-3xl font-semibold text-marino">Cobro en ruta</h1>
      <p className="mt-2 text-lg leading-7">Inicie sesión para cobrar o para ver la ruta.</p>
      {!configurado && (
        <p className="mt-6 rounded-2xl bg-ambar-fondo px-4 py-3 text-ambar" role="status">
          Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Sin ellas esta pantalla no puede entrar a la base.
        </p>
      )}
      <form className="mt-6 space-y-4" onSubmit={(evento) => void enviar(evento)}>
        <label className="block text-sm font-medium" htmlFor="correo">
          Correo
          <input
            id="correo"
            type="email"
            autoComplete="username"
            required
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            className="mt-1 min-h-14 w-full rounded-2xl border border-linea bg-white px-4 text-lg"
          />
        </label>
        <label className="block text-sm font-medium" htmlFor="contrasena">
          Contraseña
          <input
            id="contrasena"
            type="password"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
            className="mt-1 min-h-14 w-full rounded-2xl border border-linea bg-white px-4 text-lg"
          />
        </label>
        <Aviso texto={error} />
        <Boton tipo="submit" ocupado={ocupado || !configurado}>
          Entrar
        </Boton>
      </form>
      <p className="mt-6 text-sm leading-6 text-marino/80">
        Cuentas de demostración: admin@demo.invalid, repartidor1@demo.invalid y repartidor2@demo.invalid. La contraseña la define quien instala el proyecto.
      </p>
      <Pie />
    </main>
  );
}
