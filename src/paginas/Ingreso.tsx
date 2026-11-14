import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Aviso } from "../componentes/Aviso";
import { Boton } from "../componentes/Boton";
import { Pie } from "../componentes/Pie";
import { useSesion } from "../contexto/Sesion";

export default function Ingreso() {
  const { configurado, cargando, sesion, error, entrar } = useSesion();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ocupado, setOcupado] = useState(false);

  if (cargando) return <div className="stage"><p className="pad" role="status">Cargando…</p></div>;
  if (sesion?.rol === "repartidor") return <Navigate to="/repartidor" replace />;
  if (sesion?.rol === "admin") return <Navigate to="/admin" replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    await entrar(correo.trim(), contrasena);
    setOcupado(false);
  }

  return (
    <div className="stage">
      <main className="ingreso">
        <p className="muted">Poch</p>
        <h1>Cobro en ruta</h1>
        <p>Inicie sesión para ver su ruta o el tablero.</p>
        {!configurado && (
          <Aviso tono="ambar">
            Faltan las variables de acceso. Sin ellas esta pantalla no puede entrar a la base.
          </Aviso>
        )}
        <form className="pila sep" onSubmit={(evento) => void enviar(evento)}>
          <label htmlFor="correo">
            Correo
            <input
              id="correo"
              type="email"
              autoComplete="username"
              required
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
            />
          </label>
          <label htmlFor="contrasena">
            Contraseña
            <input
              id="contrasena"
              type="password"
              autoComplete="current-password"
              required
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
            />
          </label>
          <Aviso texto={error} />
          <Boton tipo="submit" ocupado={ocupado || !configurado}>Entrar</Boton>
        </form>
        <p className="muted sep">
          Cuentas de demostración: admin@demo.invalid, repartidor1@demo.invalid y repartidor2@demo.invalid.
          La contraseña la define quien instala el proyecto.
        </p>
        <Pie />
      </main>
    </div>
  );
}
