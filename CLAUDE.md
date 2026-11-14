# Instrucciones para el agente de desarrollo (Claude Code)

Proyecto: **Poch**, cobro en ruta con CoDi para repartidores (Cursor Hackatón México, 14 de noviembre de 2026). Entrega: domingo 15 de noviembre, 1:00 p. m. hora CDMX.

## Qué hacer primero

1. Lee `docs/PROMPT-CONSTRUCCION.md` completo. Es el encargo: decisiones, SQL, funciones, pantallas, pruebas y criterios de aceptación.
2. Lee `docs/PEY-VERIFICADO.md` y `docs/BITACORA-DE-DESARROLLO.md`.
3. Los archivos que ya existen (README, docs, migraciones) son la base. Complétalos, no los reemplaces a ciegas. Las migraciones de `supabase/migrations/` ya están probadas: no las cambies; si algo falla al correrlas, repórtalo.

## Reglas del repositorio (plan de desarrollo de Yoltik)

- Git Flow simplificado: `main` solo contiene lo que funciona y fue probado; `develop` integra; cada pieza va en `feature/<nombre-corto>` con pull request a `develop`. Al cierre, `develop` pasa a `main` con pull request.
- Commits en español: `tipo: qué cambió` (`feat`, `fix`, `docs`, `test`, `chore`), una línea, un tema por commit. Nunca `push --force` ni reescribir historial.
- Después de cada hito, en el mismo commit: una línea en `docs/BITACORA-DE-DESARROLLO.md` (fecha y hora de CDMX, qué se hizo, qué se probó, qué falta).
- Mantén al día `README.md`, `docs/PEY-VERIFICADO.md` y `docs/cuaderno-de-datos.md`. El repositorio debe permitir un resumen fiel de lo que se trabaja en cualquier momento.
- Repositorio **público**: ninguna llave, secreto, CLABE, teléfono ni dato real. Antes de cada push, busca cadenas parecidas a llaves, tokens o CLABE.
- No agregues archivo de licencia (decide Polo).

## Estilo

Interfaz y documentación en español de México, tratando de usted, con oraciones cortas. Sin analogías contables al explicar conceptos técnicos.
