// Root layout: the document shell. Fonts are self-hosted, so the CSP needs no outside origins.
import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import "./globals.css";

const publicSans = localFont({
  src: "./fonts/PublicSans-Variable-latin.woff2",
  weight: "400 700",
  variable: "--font-sans",
  display: "swap",
});

/** Default page title and description; each page can override them. */
export const metadata: Metadata = {
  title: "Construction material prices",
  description: "Producer price indexes for lumber, iron and steel, and concrete products.",
};

/** The HTML shell shared by every page: language, the self-hosted font, global styles. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nonce CSP only works on dynamically rendered pages (incl. the 404), so opt every route in.
  await connection();
  return (
    <html lang="en" className={publicSans.variable}>
      <body>{children}</body>
    </html>
  );
}
