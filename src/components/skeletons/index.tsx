// Esqueletos compartidos para los loading.tsx: misma caja que la pagina real (cabecera + filtros + filas de h-8),
// para que al llegar los datos no haya salto de layout.
const bar = "bg-neutral-800 rounded";

export function SkeletonShell({ children, label = "Loading" }: { children: React.ReactNode; label?: string }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-2 sm:px-6 py-6 animate-pulse" aria-busy="true" aria-label={label}>
      {children}
    </main>
  );
}

export function SkeletonRows({ rows = 10 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 flex items-center gap-3 px-3 bg-neutral-900/60">
          <div className={`h-3 w-6 ${bar}`} />
          <div className={`h-3 flex-1 max-w-xs ${bar}`} />
          <div className={`h-3 w-16 ml-auto ${bar}`} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTitle({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      {avatar && <div className={`h-16 w-16 rounded-full ${bar}`} />}
      <div className="space-y-2">
        <div className={`h-7 w-56 ${bar}`} />
        <div className={`h-3 w-40 ${bar}`} />
      </div>
    </div>
  );
}

export function SkeletonFilters({ n = 4 }: { n?: number }) {
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {Array.from({ length: n }, (_, i) => <div key={i} className={`h-8 w-24 ${bar}`} />)}
    </div>
  );
}
