const STYLES: Record<string, string> = {
  Seeded: "border-steel text-fog",
  Active: "border-sage/30 bg-sage/10 text-sage",
  Decaying: "border-copper/40 bg-copper/10 text-copper",
  Expired: "border-steel text-steel",
  Dead: "border-ash text-ash",
  Archived: "border-smoke text-smoke",
};

export function StatusBadge({ state }: { state: string }) {
  const cls = STYLES[state] ?? "border-steel text-fog";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-eyebrow uppercase tracking-wider ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {state}
    </span>
  );
}
