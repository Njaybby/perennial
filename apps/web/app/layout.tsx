import type { Metadata } from "next";
import localFont from "next/font/local";
import { Footer } from "./components/Footer";
import { Nav } from "./components/Nav";
import "./globals.css";

// Self-hosted rather than next/font/google: outbound DNS to fonts.gstatic.com (the font file host, as opposed to fonts.googleapis.com which resolves fine) was intermittently unreachable on this network ("getaddrinfo EAI_AGAIN").
// next/font/google silently fell back to a metrics-only substitute and every display heading rendered in a generic sans-serif, so the two files are fetched once into public/fonts/ instead.
const display = localFont({
  src: "../public/fonts/PlayfairDisplay.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "400 700",
});
const body = localFont({
  src: "../public/fonts/Inter.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "300 700",
});

export const metadata: Metadata = {
  title: "Perennial",
  description: "Storage that pays its own rent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} font-body antialiased`}>
        <Nav />
        <div className="pt-16 min-h-screen flex flex-col">
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
