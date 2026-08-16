import Image from "next/image";

/** The real mark from the design export (public/logo.png), not a guess. White on transparent, made for the dark surfaces. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/logo.png" alt="Perennial" width={32} height={32} className={className} unoptimized />;
}

export function Logo({ withWordmark = false }: { withWordmark?: boolean }) {
  return (
    <a href="/" className="flex items-center gap-2 text-primary shrink-0">
      <LogoMark className="h-7 w-7" />
      {withWordmark && <span className="font-display text-subheading tracking-tight">Perennial</span>}
    </a>
  );
}
