import { SkeletonShell, SkeletonTitle, SkeletonRows } from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonTitle />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonRows rows={10} />
        <SkeletonRows rows={10} />
      </div>
    </SkeletonShell>
  );
}
