import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "../components/AppShell";

export const metadata: Metadata = {
  title: { default: "CIT-LMS | CIT Business Solutions", template: "%s | CIT-LMS" },
  description: "CIT Business Solutions employee management and leave records system"
};

export const viewport: Viewport = { themeColor: "#293549" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-ZA" data-scroll-behavior="smooth"><body><AppShell>{children}</AppShell></body></html>;
}
