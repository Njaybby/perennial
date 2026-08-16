import Image from "next/image";

/** White on transparent, intended for the dark surfaces it sits on. */
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
