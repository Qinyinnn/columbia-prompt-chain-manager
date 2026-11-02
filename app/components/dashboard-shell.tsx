"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitcher } from "./theme-switcher";

const links = [
  { href: "/", label: "Overview", icon: "▦" },
  { href: "/prompt-chains", label: "Prompt chains", icon: "⌘" },
  { href: "/history", label: "Generation history", icon: "◷" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = links.find((link) => link.href === pathname);
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-emblem">C</span><span className="brand-copy"><strong>Prompt Studio</strong><small>COLUMBIA UNIVERSITY</small></span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{links.map((link) => <Link href={link.href} key={link.href} className={`nav-link ${pathname === link.href ? "active" : ""}`} aria-current={pathname === link.href ? "page" : undefined}><span className="nav-icon">{link.icon}</span><span>{link.label}</span>{link.href === "/prompt-chains" && <span className="nav-count">12</span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">✳</span><strong>Need a hand?</strong><p>Learn how to build your first prompt chain.</p><a href="mailto:promptstudio@example.edu">Visit the guide <span>→</span></a></div><div className="profile-row"><span className="profile-avatar">AC</span><span className="profile-copy"><strong>Alex Chen</strong><small>Workspace admin</small></span><button className="more-button" aria-label="Account options" type="button">···</button></div></div>
    </aside>
    <main className="main-column"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-separator">/</span><strong>{current?.label ?? "Overview"}</strong></div><div className="topbar-actions"><span className="topbar-note"><span className="status-dot" /> All changes saved</span><ThemeSwitcher /><span className="topbar-avatar">AC</span></div></header>{children}</main>
  </div>;
}
