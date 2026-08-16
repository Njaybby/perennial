import { LogoMark } from "./Logo";

export function Footer() {
  return (
    <footer className="w-full py-20 px-6 max-w-(--spacing-max-width) mx-auto border-t border-graphite flex flex-col md:flex-row justify-between gap-8">
      <div className="flex items-center gap-2 text-fog">
        <LogoMark className="h-6 w-6" />
        <span className="text-body-sm opacity-80">Perennial Protocol, devnet build.</span>
      </div>
      <p className="text-body-sm text-fog opacity-60 max-w-xl">
        Self-funding storage on Shelby, live on Aptos devnet. No wallet connection in this build:
        owner actions (top up, claim, archive) sign server-side with this deployment&apos;s own demo keys, not a
        visitor&apos;s wallet. See <code className="text-mist">docs/DECISIONS.md</code> for that and everything
        else that&apos;s real versus design-only.
      </p>
    </footer>
  );
}
