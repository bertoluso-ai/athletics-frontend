import { SkeletonShell, SkeletonTitle, SkeletonFilters, SkeletonRows } from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading athlete">
      <SkeletonTitle avatar />
      <SkeletonFilters n={5} />
      <SkeletonRows rows={12} />
    </SkeletonShell>
  );
}
