import type { ReactNode } from "react";

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="tw">
      <table className="t">{children}</table>
    </div>
  );
}
