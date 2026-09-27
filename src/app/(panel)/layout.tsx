import { requirePageSession } from "@/lib/pageAuth";
import PanelShell from "@/components/layout/PanelShell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  return <PanelShell admin={session}>{children}</PanelShell>;
}
