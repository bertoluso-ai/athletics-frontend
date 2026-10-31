import { SkeletonShell, SkeletonTitle, SkeletonRows } from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell label="Loading countries">
      <SkeletonTitle />
      <SkeletonRows rows={14} />
    </SkeletonShell>
  );
}
