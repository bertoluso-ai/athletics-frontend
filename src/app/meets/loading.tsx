import { SkeletonShell, SkeletonTitle, SkeletonFilters, SkeletonRows } from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading meetings">
      <SkeletonTitle />
      <SkeletonFilters n={4} />
      <SkeletonRows rows={14} />
    </SkeletonShell>
  );
}
