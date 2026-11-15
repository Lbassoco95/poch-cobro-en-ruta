import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type OpcionLista = { valor: string; texto: string };

export function Lista({
  id,
  etiqueta,
  valor,
  alCambiar,
  opciones,
  placeholder = "Elija una opción",
}: {
  id?: string;
  etiqueta?: string;
  valor: string;
  alCambiar: (valor: string) => void;
  opciones: OpcionLista[];
  placeholder?: string;
}) {
  const reactId = useId();
  const listaId = `${reactId}-lista`;
  const botonId = id ?? `${reactId}-boton`;
  const [abierta, setAbierta] = useState(false);
  const [foco, setFoco] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const elegida = opciones.find((opcion) => opcion.valor === valor);

  useEffect(() => {
    if (!abierta) return;
    const indice = opciones.findIndex((opcion) => opcion.valor === valor);
    setFoco(indice >= 0 ? indice : 0);
    const cerrar = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierta, opciones, valor]);

  function elegir(indice: number) {
    const opcion = opciones[indice];
    if (!opcion) return;
    alCambiar(opcion.valor);
    setAbierta(false);
  }

  function tecla(evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "Escape") {
      setAbierta(false);
      return;
    }
    if (!abierta && (evento.key === "ArrowDown" || evento.key === "Enter" || evento.key === " ")) {
      evento.preventDefault();
      setAbierta(true);
      return;
    }
    if (!abierta || opciones.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setFoco((actual) => Math.min(opciones.length - 1, actual + 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setFoco((actual) => Math.max(0, actual - 1));
    } else if (evento.key === "Home") {
      evento.preventDefault();
      setFoco(0);
    } else if (evento.key === "End") {
      evento.preventDefault();
      setFoco(opciones.length - 1);
    } else if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      elegir(foco);
    }
  }

  return (
    <div className="lista" ref={raiz}>
      <button
        id={botonId}
        type="button"
        className="lista-boton"
        aria-label={etiqueta}
        aria-haspopup="listbox"
        aria-expanded={abierta}
        aria-controls={listaId}
        onClick={() => setAbierta((actual) => !actual)}
        onKeyDown={tecla}
      >
        <span>{elegida?.texto ?? placeholder}</span>
        <span className="lista-flecha" aria-hidden="true">{abierta ? "▴" : "▾"}</span>
      </button>
      {abierta ? (
        <ul id={listaId} className="lista-menu" role="listbox" aria-labelledby={botonId}>
          {opciones.length === 0 ? <li className="lista-vacia">No hay opciones</li> : null}
          {opciones.map((opcion, indice) => (
            <li key={`${opcion.valor}-${indice}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opcion.valor === valor}
                className={indice === foco ? "foco" : undefined}
                onMouseEnter={() => setFoco(indice)}
                onClick={() => elegir(indice)}
              >
                <span>{opcion.texto}</span>
                {opcion.valor === valor ? <span aria-hidden="true">✓</span> : <span aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
