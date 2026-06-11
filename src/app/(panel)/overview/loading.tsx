import { SkeletonCard } from "@/components/ui/Skeleton";
import { SkeletonStatGrid, SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SkeletonCard height={88} />
      <SkeletonStatGrid />
      <SkeletonList rows={5} />
    </div>
  );
}
