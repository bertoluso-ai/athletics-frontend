import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Sitio PRIVADO: en produccion todo el sitio pide usuario y clave (HTTP Basic) hasta que se publique a proposito.
//  - Cerrado por defecto: si faltan SITE_USER / SITE_PASSWORD responde 503 (nunca se abre por un despliegue sin configurar).
//  - Para abrirlo al publico hay que definir SITE_PUBLIC=1 en Vercel de forma explicita.
//  - /api/health* queda fuera: lo consultan las alarmas de Cloud Monitoring (solo devuelve estado de salud, nada de datos).
//  - En desarrollo local (next dev) no se bloquea nada.
// Siempre se envia X-Robots-Tag: noindex para que ningun buscador indexe nada.

const OPEN_PATH_PREFIXES = ["/api/health"];

function safeEqual(a: string, b: string): boolean {
  // comparacion en tiempo constante (evita filtrar la clave por tiempos de respuesta)
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function withRobots(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

export function proxy(req: NextRequest) {
  if (process.env.NODE_ENV !== "production" || process.env.SITE_PUBLIC === "1") return withRobots(NextResponse.next());

  const { pathname } = req.nextUrl;
  if (OPEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return withRobots(NextResponse.next());

  const user = process.env.SITE_USER;
  const password = process.env.SITE_PASSWORD;
  if (!user || !password) {
    return withRobots(new NextResponse("Sitio privado: acceso no configurado.", { status: 503, headers: { "Cache-Control": "no-store" } }));
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), password)) return withRobots(NextResponse.next());
    } catch {
      /* cabecera mal formada: cae al 401 */
    }
  }
  return withRobots(
    new NextResponse("Acceso restringido.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Sitio privado", charset="UTF-8"', "Cache-Control": "no-store" },
    })
  );
}

export const config = {
  // todo salvo los ficheros estaticos de build (JS/CSS), que no contienen datos
  matcher: ["/((?!_next/static).*)"],
};
