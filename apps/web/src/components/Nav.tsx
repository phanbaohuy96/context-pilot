const links = [
  { href: "/", label: "Dashboard" },
  { href: "/sources", label: "Sources" },
  { href: "/meetings", label: "Meetings" },
  { href: "/threads", label: "Threads" },
  { href: "/requirements", label: "Requirements" },
  { href: "/agent", label: "Ask agent" },
  { href: "/export", label: "Export" },
];

export function Nav() {
  return (
    <aside className="sidebar">
      <h1>Teams Discovery Observer</h1>
      <nav className="nav" aria-label="Main navigation">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
