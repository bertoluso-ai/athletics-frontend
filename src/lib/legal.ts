// Datos del titular y fechas de las paginas legales: UN solo sitio. Rellena los campos marcados con TODO antes de publicar la web al publico
// (el aviso legal exige identificar al titular: nombre, domicilio y un correo de contacto; si hay actividad economica, tambien el NIF).
// Mientras un campo siga con "TODO" la pagina lo muestra tal cual, para que no se pueda publicar por descuido sin verlo.
export const LEGAL = {
  siteName: "AthleticsInfoRanking",
  domain: "athleticsinforanking.com",
  // TODO: nombre completo (o razon social) del titular
  operatorName: "TODO: full name or company name",
  // TODO: domicilio postal (obligatorio en el aviso legal, LSSI art. 10)
  operatorAddress: "TODO: postal address",
  // TODO: NIF/CIF si la web tiene actividad economica (publicidad, ventas, suscripciones); si es un proyecto personal sin ingresos, puede omitirse
  operatorTaxId: "",
  // Correo de contacto (el mismo que ya usa el enlace "Report a data error"). Cambialo si prefieres una direccion dedicada.
  contactEmail: "bertoluso@gmail.com",
  // Pais cuya ley aplica y autoridad de proteccion de datos competente
  country: "Spain",
  authorityName: "the Spanish Data Protection Agency (AEPD, www.aepd.es)",
  // Publicidad (Google AdSense): se activa SOLO al definir NEXT_PUBLIC_ADSENSE_PUB en Vercel ("pub-XXXXXXXXXXXXXXXX"). Con publicidad hay actividad economica:
  // el aviso legal debe llevar NIF (operatorTaxId) y el titular debe estar dado de alta fiscalmente. Ver ADS_PUBLICIDAD.md.
  adsEnabled: !!process.env.NEXT_PUBLIC_ADSENSE_PUB?.trim(),
  // Fecha de la ultima revision de los textos (actualizar al modificarlos)
  lastUpdated: "20 October 2026",
} as const;
