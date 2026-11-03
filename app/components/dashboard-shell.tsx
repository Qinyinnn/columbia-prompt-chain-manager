"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "./theme-switcher";

const links = [
  { href: "/", label: "Overview", icon: "▦" },
  { href: "/prompt-chains", label: "Prompt chains", icon: "⌘" },
  { href: "/history", label: "Generation history", icon: "◷" },
];

export function DashboardShell({
  children,
  displayName,
  email,
}: {
  children: React.ReactNode;
  displayName: string;
  email: string;
}) {
  const pathname = usePathname();
  const current = links.find((link) => link.href === pathname || (link.href !== "/" && pathname.startsWith(`${link.href}/`)));
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || email[0]?.toUpperCase() || "U";
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-emblem">C</span><span className="brand-copy"><strong>Prompt Studio</strong><small>COLUMBIA UNIVERSITY</small></span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{links.map((link) => { const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`)); return <Link href={link.href} key={link.href} className={`nav-link ${active ? "active" : ""}`} aria-current={pathname === link.href ? "page" : undefined}><span className="nav-icon">{link.icon}</span><span>{link.label}</span></Link>; })}</nav>
      <div className="sidebar-bottom"><div className="profile-row"><span className="profile-avatar" aria-hidden="true">{initials}</span><span className="profile-copy"><strong>{displayName}</strong><small>{email}</small></span></div></div>
    </aside>
    <main className="main-column"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-separator">/</span><strong>{current?.label ?? "Overview"}</strong></div><div className="topbar-actions"><span className="topbar-note"><span className="status-dot" /> Signed in</span><ThemeSwitcher /><span className="topbar-avatar" title={email} aria-label={displayName}>{initials}</span><form action="/auth/signout" method="post" className="topbar-signout-form"><button className="button button-secondary signout-button" type="submit">Sign out</button></form></div></header>{children}</main>
  </div>;
}
