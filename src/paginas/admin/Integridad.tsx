import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Boton } from "../../componentes/Boton";
import { CascaronAdmin } from "../../componentes/CascaronAdmin";
import { Insignia } from "../../componentes/Insignia";
import { useSesion } from "../../contexto/Sesion";
import { ErrorDeApi, llamar } from "../../lib/api";

type Prueba = { prueba: string; ok: boolean; detalle: string };

export default function Integridad() {
  const { sesion } = useSesion();
  const [pruebas, setPruebas] = useState<Prueba[] | null>(null);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function verificar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<{ pruebas: Prueba[] }>("verificar-integridad", sesion.token);
      setPruebas(data.pruebas);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo verificar.");
    } finally {
      setOcupado(false);
    }
  }

  async function conciliar() {
    if (!sesion) return;
    setOcupado(true);
    setError("");
    try {
      const data = await llamar<{ revisadas: number; recuperadas: number }>("conciliar-con-pey", sesion.token);
      setNota(`Conciliación hecha. Revisadas: ${data.revisadas}. Recuperadas: ${data.recuperadas}.`);
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : "No se pudo conciliar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <CascaronAdmin actual="bitacora">
      <h1>Bitácora y verificación de integridad</h1>
      <p className="muted">
        La bitácora solo admite agregar filas. Cada fila lleva la huella de la anterior.
        Esta pantalla muestra lo que devuelven verificar-integridad y conciliar-con-pey.
        El tablero no incluye la bitácora completa ni las huellas.
      </p>
      <div className="acciones margen-top">
        <Boton chico ocupado={ocupado} onClick={() => void verificar()}>Verificar integridad</Boton>
        <Boton chico variante="secundario" ocupado={ocupado} onClick={() => void conciliar()}>Conciliar con pey</Boton>
      </div>
      <Aviso texto={error} />
      {nota ? <Aviso tono="ok">{nota}</Aviso> : null}
      {pruebas ? pruebas.map((prueba) => (
        <div key={prueba.prueba} className="chk">
          <div>
            <b>{prueba.prueba}</b>
            <div className="muted">{prueba.detalle}</div>
          </div>
          {prueba.ok ? <Insignia tipo="ok" /> : <Insignia tipo="falla" />}
        </div>
      )) : (
        <Aviso tono="info">Pulse «Verificar integridad» para correr las revisiones.</Aviso>
      )}
    </CascaronAdmin>
  );
}
