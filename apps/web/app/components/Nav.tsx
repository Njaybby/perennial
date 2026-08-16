"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Logo";

const LINKS = [
  { href: "/demand-index", label: "Demand Index" },
  { href: "/decay", label: "Decay Watch" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 max-w-(--spacing-max-width) mx-auto inset-x-0 border-b border-graphite bg-obsidian">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-primary">
          <LogoMark className="h-7 w-7" />
        </Link>
        <nav className="hidden md:flex gap-6">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-eyebrow font-semibold tracking-tight transition-colors duration-200 pb-1 ${
                  active ? "text-primary border-b border-primary" : "text-fog hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden md:block text-eyebrow text-fog border border-steel rounded-full px-4 py-2">
          Devnet
        </span>
      </div>
    </header>
  );
}
