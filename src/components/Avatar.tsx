// Deterministic, non-figurative placeholder for athletes with no real
// photo -- a GitHub-style identicon (symmetric grid pattern + colour, both
// derived from the athlete's name) instead of a generic illustrated face.
function hashName(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function GenericAthlete({
  name,
}: {
  name: string;
  gender?: string | null | undefined;
  nationality?: string | null | undefined;
}) {
  const hash = hashName(name || "?");
  const hue = hash % 360;
  const fg = `hsl(${hue}, 55%, 52%)`;
  const bg = `hsl(${hue}, 35%, 14%)`;
  const gridSize = 5; // 5x5, left half + centre generated, mirrored onto the right half
  const halfCols = 3;
  const cellSize = 100 / gridSize;
  const cells: { x: number; y: number }[] = [];
  let bits = hash;
  for (let x = 0; x < halfCols; x++) {
    for (let y = 0; y < gridSize; y++) {
      const on = (bits & 1) === 1;
      bits >>= 1;
      if (!on) continue;
      cells.push({ x, y });
      if (x < 2) cells.push({ x: gridSize - 1 - x, y }); // mirror columns 0,1 onto 4,3
    }
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect width="100" height="100" fill={bg} />
      {cells.map((c, i) => (
        <rect key={i} x={c.x * cellSize} y={c.y * cellSize} width={cellSize} height={cellSize} fill={fg} />
      ))}
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
