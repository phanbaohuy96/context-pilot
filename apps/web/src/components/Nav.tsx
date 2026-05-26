"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavLink = { href: string; label: string; icon: ReactNode };

const icon = (paths: ReactNode) => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths}
  </svg>
);

const links: NavLink[] = [
  { href: "/", label: "Dashboard", icon: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>) },
  { href: "/sources", label: "Sources", icon: icon(<><path d="M4 7h16M4 12h16M4 17h10" /></>) },
  { href: "/meetings", label: "Meetings", icon: icon(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>) },
  { href: "/threads", label: "Threads", icon: icon(<><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></>) },
  { href: "/requirements", label: "Requirements", icon: icon(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>) },
  { href: "/agent", label: "Ask agent", icon: icon(<><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" /><path d="M5 19l.8 2M19 17l.6 1.5" /></>) },
  { href: "/export", label: "Export", icon: icon(<><path d="M12 3v12m0 0l-4-4m4 4l4-4" /><path d="M5 21h14" /></>) },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/";

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>◉</span>
        {!collapsed ? <span className="brand-text">Teams Discovery<br />Observer</span> : null}
        <button
          type="button"
          className="nav-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>
      </div>

      <nav className="nav" aria-label="Main navigation">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={isActive(pathname, link.href) ? "active" : undefined}
            aria-current={isActive(pathname, link.href) ? "page" : undefined}
            title={collapsed ? link.label : undefined}
          >
            {link.icon}
            {!collapsed ? <span className="nav-label">{link.label}</span> : null}
          </a>
        ))}
      </nav>
    </aside>
  );
}
