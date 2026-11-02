"use client";

import { useTheme } from "next-themes";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return <label className="theme-control"><span aria-hidden="true">◐</span><span className="sr-only">Color theme</span><select aria-label="Color theme" value={theme ?? "system"} onChange={(event) => setTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>;
}
