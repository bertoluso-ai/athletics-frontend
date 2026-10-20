// ads.txt: lista publica de quien puede vender publicidad en este dominio (IAB). Google AdSense lo exige para servir anuncios.
// Solo responde cuando NEXT_PUBLIC_ADSENSE_PUB esta definido ("pub-1234567890123456", con o sin "ca-"); si no, 404 como si no existiera.
// f08c47fec0942fa0 es el identificador fijo de Google (TAG ID) en ads.txt.
export const dynamic = "force-static";

export function GET() {
  const pub = process.env.NEXT_PUBLIC_ADSENSE_PUB?.trim().replace(/^ca-/, "");
  if (!pub) return new Response("Not found", { status: 404 });
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
