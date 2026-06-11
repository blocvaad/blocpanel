import { SkeletonTable } from "@/components/ui/Skeleton";
export default function Loading() {
  return <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}><SkeletonTable rows={8} /></div>;
}
