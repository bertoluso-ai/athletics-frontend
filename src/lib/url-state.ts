// Refleja un parametro de filtro en la URL sin navegar ni volver a renderizar el servidor (history.replaceState):
// asi un refresco o un enlace compartido conservan la seleccion de los widgets de la home. Valor vacio = parametro fuera.
export function writeParam(name: string, value: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url);
}
