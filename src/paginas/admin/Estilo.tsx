import type { ReactNode } from "react";
import { Boton } from "../../componentes/Boton";
import { CascaronAdmin } from "../../componentes/CascaronAdmin";
import { Insignia } from "../../componentes/Insignia";
import { Vidrio } from "../../componentes/Vidrio";
import type { TipoInsignia } from "../../lib/parada";

const COLORES: Array<[string, string, string, string]> = [
  ["Negro vacío", "#05070D", "#F4F7FF", "Fondo base"],
  ["Negro superficie", "#0D1018", "#F4F7FF", "Superficies sólidas"],
  ["Azul medianoche", "#0A0F2E", "#F4F7FF", "Azul profundo"],
  ["Azul acción", "#2563EB", "#fff", "Botón principal"],
  ["Azul claro", "#8FB4FF", "#05070D", "Foco y siguiente parada"],
  ["Rosa vivo", "#FF4F9A", "#05070D", "Fondo vivo y pestaña activa"],
  ["Rosa profundo", "#E11D74", "#fff", "Resplandor del fondo"],
  ["Aqua (éxito)", "#5EEAD4", "#04232A", "Pagado, OK, entregada"],
  ["Rojo error", "#FF4D55", "#05070D", "Error, cancelado, falla"],
  ["Rojo botón", "#D61F3A", "#fff", "Acción destructiva"],
  ["Texto", "#F4F7FF", "#05070D", "Texto principal"],
  ["Texto secundario", "#A9B6D3", "#05070D", "Apoyos"],
];

const ESTADOS: Array<TipoInsignia | "ok" | "falla"> = [
  "porcobrar", "pendiente", "pagado", "vencido", "cancelado", "entregado", "ok", "falla",
];

function Guia() {
  return (
    <div className="panel">
      <h1>Guía de estilo de Poch</h1>
      <p className="muted">Fondo oscuro, vidrio y manchas de luz. Rosa para el fondo vivo y los detalles. Aguamarina para lo que salió bien. Rojo solo para errores.</p>
      <h2 className="margen-top-lg">Colores</h2>
      <div className="sw">
        {COLORES.map(([nombre, fondo, tinta, nota]) => (
          <div key={nombre} style={{ background: fondo, color: tinta }}>
            {nombre}
            <br />
            <code style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>{fondo}</code>
            <br />
            <span style={{ fontWeight: 400 }}>{nota}</span>
          </div>
        ))}
      </div>
      <h2 className="margen-top-lg">Fondo vivo</h2>
      <p>Cuatro manchas de luz, dos azules y dos rosas, sobre negro. Solo usan transform y opacity. Se detienen si el sistema pide reducir movimiento.</p>
      <h2 className="margen-top-lg">Vidrio</h2>
      <p>
        Fondo <code className="k">rgba(14,20,42,.66)</code> · <code className="k">blur(22px) saturate(165%)</code> · borde <code className="k">1px rgba(255,255,255,.16)</code>.
        Respaldo sin desenfoque: <code className="k">#0D1224</code>. El QR va siempre sobre blanco sólido.
      </p>
      <div className="dos">
        <Vidrio><b>Tarjeta de vidrio</b><div className="muted">Texto secundario sobre vidrio</div></Vidrio>
        <Vidrio destacado><b>Tarjeta destacada</b><div className="hielo">Degradado azul y rosa con brillo</div></Vidrio>
      </div>
      <h2 className="margen-top-lg">Tipografía</h2>
      <p><span className="monto" style={{ fontSize: 48 }}>$0.00</span></p>
      <p className="muted">Montos y folios: JetBrains Mono. Interfaz: Sora.</p>
      <h2 className="margen-top-lg">Espaciado y forma</h2>
      <p>
        Escala <code className="k">4</code> <code className="k">8</code> <code className="k">12</code> <code className="k">16</code> <code className="k">24</code> <code className="k">32</code> px
        · radio <code className="k">18 px</code> · toque mínimo <code className="k">56 px</code> en celular y <code className="k">44 px</code> en administración.
      </p>
      <h2>Estados</h2>
      <div className="grupo">
        {ESTADOS.map((tipo) => <Insignia key={tipo} tipo={tipo} />)}
      </div>
      <p className="muted">Por cobrar: contorno sólido. Esperando pago: contorno azul discontinuo. Pagado: relleno aguamarina. Vencido: punteado. Cancelado: rojo y tachado. Entregado: relleno blanco. Revisión OK en aguamarina y FALLA en rojo con doble borde.</p>
      <h2>Componentes</h2>
      <div className="acciones" style={{ maxWidth: 640 }}>
        <Boton chico>Principal</Boton>
        <Boton chico variante="secundario">Secundario</Boton>
        <Boton chico variante="entrega">Marcar entrega</Boton>
        <Boton chico variante="peligro">Cancelar</Boton>
      </div>
    </div>
  );
}

export default function Estilo({ publico = false }: { publico?: boolean }) {
  const cuerpo: ReactNode = (
    <div className="estilo">
      <Guia />
    </div>
  );
  if (publico) return <div className="stage">{cuerpo}</div>;
  return <CascaronAdmin actual="estilo">{cuerpo}</CascaronAdmin>;
}
