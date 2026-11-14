import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { llamar } from "../lib/api";
import { supabase, supabaseConfigurado } from "../lib/supabase";

export type Sesion = {
  token: string;
  rol: "admin" | "repartidor";
  nombre: string;
  correo: string;
};

type Valor = {
  configurado: boolean;
  cargando: boolean;
  sesion: Sesion | null;
  error: string;
  entrar: (correo: string, contrasena: string) => Promise<void>;
  salir: () => Promise<void>;
};

const Contexto = createContext<Valor | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(supabaseConfigurado);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let activo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return;
      if (data.session) await cargarPerfil(data.session.access_token, data.session.user.email ?? "");
      setCargando(false);
    });
    const { data: escucha } = supabase.auth.onAuthStateChange((_evento, siguiente) => {
      if (!siguiente) setSesion(null);
    });
    return () => {
      activo = false;
      escucha.subscription.unsubscribe();
    };
  }, []);

  async function cargarPerfil(token: string, correo: string) {
    const perfil = await llamar<{ rol: "admin" | "repartidor"; nombre: string }>("quien-soy", token);
    setSesion({ token, rol: perfil.rol, nombre: perfil.nombre, correo });
  }

  async function entrar(correo: string, contrasena: string) {
    if (!supabase) throw new Error("Falta configurar el acceso.");
    setError("");
    const { data, error: fallo } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
    if (fallo || !data.session) {
      setError("No pudimos iniciar sesión. Revise el correo y la contraseña.");
      return;
    }
    try {
      await cargarPerfil(data.session.access_token, correo);
    } catch {
      await supabase.auth.signOut();
      setError("La cuenta no tiene un perfil activo.");
    }
  }

  async function salir() {
    await supabase?.auth.signOut();
    setSesion(null);
  }

  return (
    <Contexto.Provider value={{ configurado: supabaseConfigurado, cargando, sesion, error, entrar, salir }}>
      {children}
    </Contexto.Provider>
  );
}

export function useSesion(): Valor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("Sesión fuera de contexto");
  return valor;
}
