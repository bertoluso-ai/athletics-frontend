# Publicidad (Google AdSense): estado y como activarla

Todo el codigo esta preparado y **desactivado**: se enciende solo al definir `NEXT_PUBLIC_ADSENSE_PUB` en Vercel. Mientras no exista, no hay categoria "Advertising" en el aviso, no se carga nada de AdSense, `/ads.txt` da 404 y los textos legales dicen que no hay publicidad.

## Lo que ya esta hecho (codigo)
- `src/components/Analytics.tsx`: categoria Advertising en el aviso y en el panel (solo si hay publicidad), Consent Mode (`ad_storage`, `ad_user_data`, `ad_personalization`), carga de `adsbygoogle.js` solo con Advertising aceptado.
- `src/app/ads.txt/route.ts`: sirve `google.com, pub-XXXX, DIRECT, f08c47fec0942fa0`.
- Politicas de privacidad/cookies y terminos: secciones de publicidad condicionadas a `LEGAL.adsEnabled`.

## Lo que falta y NO puedo hacer yo (en este orden)
1. **Decision legal sobre las fuentes de datos** (World Athletics y otras prohiben usos comerciales/publicidad). Sin esto, no abrir la web ni activar anuncios.
2. **Titular y fiscalidad**: con anuncios hay actividad economica. Rellenar `src/lib/legal.ts` (nombre, domicilio, **NIF**) y dar de alta la actividad (autonomo o sociedad) segun indique una gestoria. Declarar los ingresos.
3. **Abrir la web al publico** (`SITE_PUBLIC=1` en Vercel; hoy esta privada con usuario y clave y `noindex`). AdSense no puede revisar un sitio privado ni con `noindex`: habra que quitar `noindex` (ver `src/proxy.ts`).
4. **Crear la cuenta de AdSense**, anadir el dominio y esperar la revision (dias o semanas). Contenido: las paginas legales ya existen.
5. **CMP certificado (obligatorio en UE/Reino Unido)**: para servir anuncios en el EEE Google exige un CMP con TCF v2.2. El aviso actual NO lo es. Opcion mas simple: **Funding Choices** (gratuito, dentro de AdSense) en lugar de la barra a medida; mantener el enlace "Cookie settings" del pie y las politicas. Hasta entonces no se serviran anuncios personalizados a visitantes europeos.
6. Definir en Vercel `NEXT_PUBLIC_ADSENSE_PUB` (`pub-XXXXXXXXXXXXXXXX`) y redesplegar. Activar "Anuncios automaticos" en la consola de AdSense (o, mas adelante, colocar bloques manuales con su `data-ad-slot`).
7. Revisar con un abogado de proteccion de datos los textos legales antes de publicar.

## Notas
- Anuncios automaticos: Google decide la colocacion; no hay huecos reservados, asi que pueden mover el contenido (CLS). Si molesta, pasar a bloques manuales con alto reservado.
- GTM (`GTM-W27XXSQ8`) recibe el estado del consentimiento; las etiquetas de publicidad que se anadan en GTM deben respetar Consent Mode.
