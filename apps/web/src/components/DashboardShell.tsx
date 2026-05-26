"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "./Nav";

const STORAGE_KEY = "nav-collapsed";

// Owns the sidebar collapsed/expanded state for the dashboard shell. Defaults to
// collapsed; the choice is remembered in localStorage. Starting collapsed on both
// the server render and the first client render keeps hydration consistent — the
// stored preference is applied in an effect, after hydration.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const pathname = usePathname() ?? "";
  // The meeting workspace (/meetings/<id>, not the list) runs as a fixed-height
  // app view: the panels scroll internally instead of the whole page.
  const fullHeight = /^\/meetings\/[^/]+$/.test(pathname);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved != null) {
      setCollapsed(saved === "1");
    }
  }, []);

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className={`shell${collapsed ? "" : " expanded"}`}>
      <Nav collapsed={collapsed} onToggle={toggle} />
      <main className={`main${fullHeight ? " full-height" : ""}`}>{children}</main>
    </div>
  );
}
