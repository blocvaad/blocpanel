import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import PanelShell from "@/components/layout/PanelShell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <PanelShell admin={session}>{children}</PanelShell>;
}
