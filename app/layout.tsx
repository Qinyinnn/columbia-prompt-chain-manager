import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./components/theme-provider";
import { DashboardShell } from "./components/dashboard-shell";

export const metadata: Metadata = {
  title: "Prompt Studio | Columbia University",
  description: "A thoughtful workspace for repeatable prompt workflows.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider><DashboardShell>{children}</DashboardShell></ThemeProvider>
      </body>
    </html>
  );
}
