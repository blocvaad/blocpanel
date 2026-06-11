import { SkeletonList } from "@/components/ui/Skeleton";
export default function Loading() {
  return <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}><SkeletonList rows={8} /></div>;
}
