import type { Metadata } from "next";
import type { ReactNode } from "react";
import { en } from "@/locales/en";
import "./globals.css";

export const metadata: Metadata = {
  title: en.app.name,
  description: en.app.description,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
