import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";

const req = (path: string, auth?: string) => new NextRequest(`https://example.com${path}`, { headers: auth ? { authorization: auth } : {} });
const basic = (u: string, p: string) => "Basic " + btoa(`${u}:${p}`);

describe("proxy: sitio privado", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_USER", "yo");
    vi.stubEnv("SITE_PASSWORD", "secreto");
    vi.stubEnv("SITE_PUBLIC", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sin credenciales -> 401 con WWW-Authenticate", () => {
    const r = proxy(req("/"));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("Basic");
  });
  it("credenciales incorrectas -> 401", () => {
    expect(proxy(req("/", basic("yo", "mal"))).status).toBe(401);
    expect(proxy(req("/", basic("otro", "secreto"))).status).toBe(401);
  });
  it("credenciales correctas -> pasa", () => {
    expect(proxy(req("/athletes/x", basic("yo", "secreto"))).status).toBe(200);
  });
  it("clave con dos puntos funciona", () => {
    vi.stubEnv("SITE_PASSWORD", "a:b:c");
    expect(proxy(req("/", basic("yo", "a:b:c"))).status).toBe(200);
  });
  it("cabecera mal formada -> 401, no error", () => {
    expect(proxy(req("/", "Basic !!!no-base64")).status).toBe(401);
  });
  it("/api/health queda abierto (alarmas de monitorizacion)", () => {
    expect(proxy(req("/api/health")).status).toBe(200);
    expect(proxy(req("/api/health/regression")).status).toBe(200);
  });
  it("otras rutas de la API NO quedan abiertas", () => {
    expect(proxy(req("/api/search?q=x")).status).toBe(401);
    expect(proxy(req("/api/healthcheck-falso")).status).toBe(401);
  });
  it("sin SITE_USER / SITE_PASSWORD -> 503 (cerrado por defecto)", () => {
    vi.stubEnv("SITE_USER", "");
    expect(proxy(req("/", basic("yo", "secreto"))).status).toBe(503);
  });
  it("SITE_PUBLIC=1 abre el sitio", () => {
    vi.stubEnv("SITE_PUBLIC", "1");
    expect(proxy(req("/")).status).toBe(200);
  });
  it("en desarrollo no bloquea", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(req("/")).status).toBe(200);
  });
  it("siempre marca noindex", () => {
    expect(proxy(req("/")).headers.get("x-robots-tag")).toContain("noindex");
    expect(proxy(req("/", basic("yo", "secreto"))).headers.get("x-robots-tag")).toContain("noindex");
  });
});
