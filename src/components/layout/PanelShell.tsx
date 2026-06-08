"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import type { PanelAdmin } from "@/lib/auth";

export default function PanelShell({ admin, children }: { admin: PanelAdmin; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <div className="page">
      <div className={`sidebar-overlay${open ? " active" : ""}`} onClick={() => setOpen(false)} />
      <Sidebar admin={admin} isOpen={open} onClose={() => setOpen(false)} />
      <div className="main">
        <TopBar admin={admin} onMenuClick={() => setOpen(true)} />
        <main className="content fade-up">{children}</main>
      </div>
    </div>
  );
}
