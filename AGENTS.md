<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Convenciones de UI (diseno)

- **Estilo denso, tipo PCS:** los radios se fijan en `globals.css` (`--radius-*`, de 2 a 12 px segun el nombre). Se usan las clases de Tailwind (`rounded`, `rounded-lg`, `rounded-xl`...) y no se fijan valores a mano: el cambio de estilo se hace en un solo sitio.
- **Contraste:** el naranja de texto es `orange-400` (`#b83c0b`, 5,7:1 sobre blanco); el naranja vivo (`orange-500`) solo para fondos de botones con texto negro y para graficos. No poner `text-orange-400` sobre `neutral-800` salvo en etiquetas cortas.
- **Foco de teclado:** hay un `:focus-visible` global (anillo naranja). No lo quites con `outline-none` sin dar otro indicador.
- **Selectores:** hasta 6 opciones -> pills o botones segmentados; mas de 6 -> `<select>` (aspecto unificado en `globals.css`, base en `src/components/ui/select.ts`); multiple o sin JS -> `MultiSelectDropdown` / `LinkSelect`; ano -> pestanas en escritorio y `<select>` en movil.
- **Tablas hechas con grid:** `role="table"` + `role="row"` + `role="columnheader"`/`role="cell"` y `aria-sort` en la columna ordenada (ver `rankings/page.tsx`).
- **Estado de filtros:** los de la home viven en la URL (`ucat`, `udisc`, `pg`, `pgen`, `pev`; ver `lib/url-state.ts`); el resto de la app usa `searchParams`.
- **Despliegue:** `./deploy/deploy-remoto.sh` (el `git push` solo lanza el CI).
