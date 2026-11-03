import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import { ThemeProvider } from "./components/theme-provider";

export const metadata: Metadata = {
  title: "Prompt Studio | Columbia University",
  description: "A thoughtful workspace for repeatable prompt workflows.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
