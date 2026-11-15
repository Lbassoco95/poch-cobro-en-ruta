import type { ReactNode } from "react";

export function Vidrio({
  children,
  destacado = false,
  className = "",
}: {
  children: ReactNode;
  destacado?: boolean;
  className?: string;
}) {
  return <div className={`card${destacado ? " hero" : ""} ${className}`.trim()}>{children}</div>;
}
