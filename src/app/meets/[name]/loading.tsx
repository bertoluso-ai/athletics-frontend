import { SkeletonShell, SkeletonTitle, SkeletonFilters, SkeletonRows } from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading results">
      <SkeletonTitle />
      <SkeletonFilters n={6} />
      <SkeletonRows rows={12} />
    </SkeletonShell>
  );
}
