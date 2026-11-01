import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CIT-LMS | Employee Management",
  description: "CIT employee management and leave records system"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-ZA"><body>{children}</body></html>;
}
