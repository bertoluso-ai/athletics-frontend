export default function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="w-6 h-6 rounded-full object-cover shrink-0" />
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] font-bold shrink-0">
      {name.charAt(0)}
    </span>
  );
}
