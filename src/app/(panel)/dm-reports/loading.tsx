import { SkeletonCard } from "@/components/ui/Skeleton";
export default function Loading() {
  return <div style={{ maxWidth: "1100px", display: "flex", flexDirection: "column", gap: "18px" }}><SkeletonCard /><SkeletonCard /></div>;
}
