"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtDuration } from "../components/RunwayMeter";
import { StatusBadge } from "../components/StatusBadge";

const STATE_NAMES = ["Seeded", "Active", "Decaying", "Expired", "Dead", "Archived"];

interface BlobRow {
  label: string;
  endowmentAddress: string;
  state: number;
  balance: string;
  runwaySecs: string;
  targetRunwaySecs: string;
  error?: string;
}

export default function DecayPage() {
  const [blobs, setBlobs] = useState<BlobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setError(null);
        setBlobs(json.blobs);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    const valid = (blobs ?? []).filter((b) => !b.error);
    return [...valid].sort((a, b) => Number(a.runwaySecs) - Number(b.runwaySecs));
  }, [blobs]);

  async function topUp(address: string) {
    setPending(address);
    setActionError(null);
    try {
      const res = await fetch("/api/actions/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount: 500 }),
      });
      const json = await res.json();
      if (!res.ok) setActionError(json.error ?? "Top up failed.");
    } catch (err) {
      setActionError(String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="max-w-(--spacing-max-width) mx-auto px-6 md:px-10 pt-16 pb-24">
      <header className="mb-16">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-primary mb-6">The Death Watch</h1>
        <p className="text-body-lg text-fog max-w-2xl">
          These blobs are running out of time. Anyone can extend any of them. Focus on urgency and collective
          preservation.
        </p>
        <p className="text-body-xs text-ash mt-4">
          No wallet connected in this build: Top Up signs with this deployment&apos;s demo key, not yours.
        </p>
      </header>

      {error && <div className="text-copper text-body-xs mb-8">{error}</div>}
      {actionError && <div className="text-copper text-body-xs mb-8">{actionError}</div>}
      {!error && !blobs && <div className="text-fog">Loading on-chain state…</div>}

      {rows.length > 0 && (
        <section className="bg-onyx border border-graphite rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-graphite bg-carbon">
                  <th className="py-7 px-6 text-eyebrow text-mist uppercase tracking-wider">Blob</th>
                  <th className="py-7 px-6 text-eyebrow text-mist uppercase tracking-wider">Runway</th>
                  <th className="py-7 px-6 text-eyebrow text-mist uppercase tracking-wider">State</th>
                  <th className="py-7 px-6 text-eyebrow text-mist uppercase tracking-wider">Balance (octas)</th>
                  <th className="py-7 px-6 text-eyebrow text-mist uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-body-sm divide-y divide-graphite">
                {rows.map((b) => {
                  const state = STATE_NAMES[b.state] ?? "Unknown";
                  const pct = Number(b.targetRunwaySecs) > 0 ? Math.min(100, (Number(b.runwaySecs) / Number(b.targetRunwaySecs)) * 100) : 0;
                  const terminal = state === "Dead" || state === "Archived";
                  const canRevive = state === "Expired";
                  return (
                    <tr key={b.endowmentAddress} className="hover:bg-carbon transition-colors">
                      <td className={`py-7 px-6 font-display text-subheading ${terminal ? "text-fog line-through" : "text-primary"}`}>
                        <Link href={`/blob/${b.endowmentAddress}`} className="hover:text-copper transition-colors">
                          {b.label}
                        </Link>
                      </td>
                      <td className="py-7 px-6 w-1/4">
                        <div className="flex flex-col gap-3">
                          <div className="flex justify-between text-eyebrow">
                            <span className={terminal ? "text-steel" : "text-copper"}>{terminal ? "Frozen" : fmtDuration(Number(b.runwaySecs))}</span>
                            <span className="text-fog">target {fmtDuration(Number(b.targetRunwaySecs))}</span>
                          </div>
                          <div className="w-full h-1 bg-graphite rounded-full overflow-hidden">
                            <div className={`h-full ${terminal ? "bg-steel" : "gilded-bg"}`} style={{ width: `${Math.max(pct, terminal ? 0 : 1)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-7 px-6">
                        <StatusBadge state={state} />
                      </td>
                      <td className="py-7 px-6 text-fog">{Number(b.balance).toLocaleString()}</td>
                      <td className="py-7 px-6 text-right">
                        {terminal ? (
                          <button className="text-eyebrow text-steel border border-slate px-4 py-2 rounded-full cursor-not-allowed" disabled>
                            {state}
                          </button>
                        ) : (
                          <button
                            onClick={() => topUp(b.endowmentAddress)}
                            disabled={pending === b.endowmentAddress}
                            className="text-eyebrow text-primary border border-steel px-4 py-2 rounded-full hover:border-primary transition-colors disabled:opacity-50"
                          >
                            {pending === b.endowmentAddress ? "Topping up…" : canRevive ? "Revive" : "Top Up"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
