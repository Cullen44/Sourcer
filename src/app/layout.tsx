import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Sourcer" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <div className="inner">
            <Link href="/" className="brand">Sourcer</Link>
            <nav>
              <Link href="/">Overview</Link>
              <Link href="/creators">Creators</Link>
              <Link href="/youtube">Discovery</Link>
              <Link href="/sponsors">Sponsors</Link>
              <Link href="/ads">Ads</Link>
              <Link href="/changes">Changes</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
