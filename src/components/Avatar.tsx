import { useId } from "react";
import { flagUrl } from "@/lib/flags";

// Generic runner bust used when we have no real photo: flat-shaded and
// clearly illustrative (not an attempt at a fake photo). One male, one
// female design, with the nationality's flag dropped into a plate on the
// chest -- the way a kit sponsor plate would read. Paths as supplied.
function GenericAthlete({
  name,
  gender,
  nationality,
}: {
  name: string;
  gender: string | null | undefined;
  nationality: string | null | undefined;
}) {
  const uid = useId();
  const skinGradId = `${uid}-skin`;
  const shirtGradId = `${uid}-shirt`;
  const isWoman = gender === "Women";
  const flag = flagUrl(nationality);

  // Matches the reference exactly: no visible neck (head sits straight on
  // the shoulders), no hair (a bald/shaved silhouette -- one simple flat
  // ponytail shape for the woman variant only), a wide smooth shoulder
  // dome, and a small rectangular flag badge set to the upper-left of the
  // chest like a real kit sponsor patch, not a big centred plate.
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect width="100" height="100" fill="#171717" />
      <defs>
        <linearGradient id={skinGradId} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#f0c6a3" />
          <stop offset="100%" stopColor="#dbab81" />
        </linearGradient>
        <linearGradient id={shirtGradId} x1="0.2" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#7b8794" />
          <stop offset="100%" stopColor="#525c67" />
        </linearGradient>
      </defs>

      {isWoman && (
        <path d="M67,44 C79,48 80,68 71,76 C75,62 72,50 63,44 Z" fill="#20242c" />
      )}

      {/* shoulders / torso, flat top meeting the head with no neck gap */}
      <path d="M12,102 C12,68 28,53 50,53 C72,53 88,68 88,102 Z" fill={`url(#${shirtGradId})`} />

      {/* flag badge, small and offset to the upper-left of the chest */}
      <g transform="translate(32, 66)">
        <rect x="-9" y="-6.5" width="21" height="14" rx="2" fill="#0f0f0f" />
        {flag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <image href={flag} x="-8" y="-5.5" width="19" height="12" preserveAspectRatio="xMidYMid slice" />
        ) : (
          <rect x="-8" y="-5.5" width="19" height="12" fill="#3a3f4a" />
        )}
      </g>

      {/* ears */}
      <circle cx="30" cy="41" r="4.5" fill={`url(#${skinGradId})`} />
      <circle cx="70" cy="41" r="4.5" fill={`url(#${skinGradId})`} />

      {/* head, flat bottom directly on the shoulders */}
      <path d="M32,55 L32,34 C32,18 40,8 50,8 C60,8 68,18 68,34 L68,55 Z" fill={`url(#${skinGradId})`} />
    </svg>
  );
}

export default function Avatar({
  src,
  name,
  gender,
  nationality,
}: {
  src: string | null;
  name: string;
  gender?: string | null;
  nationality?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="w-6 h-6 rounded-full object-cover shrink-0" />
    );
  }
  return (
    <span className="w-6 h-6 rounded-full overflow-hidden shrink-0 block">
      <GenericAthlete name={name} gender={gender} nationality={nationality} />
    </span>
  );
}

export { GenericAthlete };
