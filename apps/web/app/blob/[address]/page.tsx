"use client";

import { use, useEffect, useState } from "react";
import { LIFECYCLE_STATES } from "@perennial/core";
import { RunwayMeter } from "../../components/RunwayMeter";
import { StatusBadge } from "../../components/StatusBadge";

interface Summary {
  endowmentAddress: string;
  blobId: string;
  owner: string;
  state: number;
  balance: string;
  creatorClaimable: string;
  lifetimeRevenue: string;
  lifetimeRent: string;
  lifetimeCreator: string;
  lifetimeProtocol: string;
  reads: string;
  renewals: string;
  runwaySecs: string;
  targetRunwaySecs: string;
  rentBps: number;
  creatorBps: number;
  protocolBps: number;
}

interface BlobEvent {
  type: "seed" | "credit" | "renew" | "top_up" | "claim" | "archive";
  txHash: string;
  atSecs: number;
  /** Raw Move event fields, all serialized as strings. Null when the transaction couldn't be re-fetched. */
  data: Record<string, string> | null;
  success: boolean | null;
}

interface DetailResponse {
  label: string | null;
  summary: Summary;
  events: BlobEvent[];
  error?: string;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Narrows to events whose on-chain payload was actually recovered, since those are the only ones with numbers to render. */
function eventsWithData(events: BlobEvent[], type: BlobEvent["type"]): (BlobEvent & { data: Record<string, string> })[] {
  return events.filter((e): e is BlobEvent & { data: Record<string, string> } => e.type === type && e.data !== null);
}

function RevenueChart({ events }: { events: BlobEvent[] }) {
  const credits = eventsWithData(events, "credit");
  if (credits.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-fog text-body-xs">No credited reads yet.</div>;
  }

  let cumulative = 0;
  const points = credits.map((e) => {
    cumulative += Number(e.data.gross);
    return { x: e.atSecs, y: cumulative };
  });
  const minX = points[0].x;
  const maxX = points[points.length - 1].x || minX + 1;
  const maxY = points[points.length - 1].y || 1;

  const path = points
    .map((p, i) => {
      const x = ((p.x - minX) / (maxX - minX || 1)) * 100;
      const y = 100 - (p.y / maxY) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="flex-1 relative w-full h-full border-b border-l border-graphite">
      <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d={path} fill="none" stroke="url(#gilded)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <defs>
          <linearGradient id="gilded" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#cc9166" />
            <stop offset="100%" stopColor="#f5e6d3" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
        <div className="w-full h-px border-t border-dashed border-slate" />
        <div className="w-full h-px border-t border-dashed border-slate" />
        <div className="w-full h-px border-t border-dashed border-slate" />
      </div>
    </div>
  );
}

export default function BlobDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/blob/${address}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setError(null);
        setDetail(json);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  async function callAction(path: string) {
    setBusy(path);
    setActionError(null);
    try {
      const res = await fetch(`/api/actions/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount: 500 }),
      });
      const json = await res.json();
      if (!res.ok) setActionError(json.error ?? `${path} failed.`);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <main className="max-w-(--spacing-max-width) mx-auto px-6 md:px-10 pt-16 pb-24">
        <div className="text-copper text-body-xs">{error}</div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="max-w-(--spacing-max-width) mx-auto px-6 md:px-10 pt-16 pb-24">
        <div className="text-fog">Loading on-chain state…</div>
      </main>
    );
  }

  const { summary, events, label } = detail;
  const state = LIFECYCLE_STATES[summary.state] ?? "Unknown";
  const runway = Number(summary.runwaySecs);
  const burnPerSec = runway > 0 ? Math.floor(Number(summary.balance) / runway) : 0;
  const renewals = eventsWithData(events, "renew");

  return (
    <main className="max-w-(--spacing-max-width) mx-auto px-6 md:px-10 pt-16 pb-24 flex flex-col gap-24">
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-heading text-primary">{label ?? "blob"}</h1>
            <StatusBadge state={state} />
          </div>
          <div className="flex items-center gap-2 text-eyebrow text-ash tracking-widest">
            <span>{truncate(summary.blobId)}</span>
            <span className="text-fog">&middot; owner {truncate(summary.owner)}</span>
          </div>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => callAction("topup")}
              disabled={busy !== null}
              className="px-6 py-2.5 rounded-full border border-steel text-primary text-eyebrow hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {busy === "topup" ? "Topping up…" : "Top Up 500"}
            </button>
            <button
              onClick={() => callAction("claim")}
              disabled={busy !== null || Number(summary.creatorClaimable) === 0}
              className="px-6 py-2.5 rounded-full bg-primary text-obsidian text-eyebrow hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {busy === "claim" ? "Claiming…" : `Claim Creator Revenue (${summary.creatorClaimable})`}
            </button>
            {archiveConfirm === summary.endowmentAddress ? (
              <button
                onClick={() => callAction("archive")}
                disabled={busy !== null}
                className="px-4 py-2.5 rounded-full border border-error text-error text-eyebrow"
              >
                Confirm archive
              </button>
            ) : (
              <button
                onClick={() => setArchiveConfirm(summary.endowmentAddress)}
                disabled={busy !== null || state === "Archived"}
                className="px-4 py-2.5 rounded-full border border-graphite text-fog text-eyebrow hover:text-error hover:border-error/50 transition-colors disabled:opacity-40"
              >
                Archive
              </button>
            )}
          </div>
          <span className="text-body-xs text-ash">No wallet connected: these sign with this deployment&apos;s demo keys, not yours.</span>
        </div>
      </header>

      {actionError && <div className="text-copper text-body-xs -mt-16">{actionError}</div>}

      <section className="flex flex-col gap-6">
        <RunwayMeter
          label={label ?? "blob"}
          state={state}
          runwaySecs={runway}
          targetRunwaySecs={Number(summary.targetRunwaySecs)}
          burnPerSec={burnPerSec}
          lastDeltaSecs={null}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 -mt-12">
        <div className="md:col-span-7 bg-onyx rounded-lg border border-graphite p-6 flex flex-col gap-6 h-[360px]">
          <h3 className="font-display text-subheading text-primary">Revenue Trajectory</h3>
          <RevenueChart events={events} />
        </div>
        <div className="md:col-span-5 flex flex-col gap-6">
          <div className="bg-carbon rounded-lg border border-slate p-6 flex flex-col gap-2">
            <span className="text-eyebrow text-fog uppercase tracking-widest">Current Balance</span>
            <div className="font-display text-headline-lg-mobile text-primary">{Number(summary.balance).toLocaleString()} octas</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatBox label="Burn / Sec" value={`${burnPerSec} octas`} />
            <StatBox label="Lifetime Revenue" value={Number(summary.lifetimeRevenue).toLocaleString()} />
            <StatBox label="Total Renewals" value={summary.renewals} />
            <StatBox label="Adaptive Split" value={`${summary.rentBps / 100}/${summary.creatorBps / 100}/${summary.protocolBps / 100}`} />
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-6">
        <h3 className="font-display text-subheading text-primary">Renewal Ledger</h3>
        <div className="bg-onyx rounded-lg border border-graphite overflow-hidden">
          {renewals.length === 0 ? (
            <div className="p-6 text-fog text-body-xs">No renewals yet.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-graphite bg-carbon/50">
                  <th className="py-6 px-6 text-eyebrow text-fog uppercase tracking-wider font-normal">Date</th>
                  <th className="py-6 px-6 text-eyebrow text-fog uppercase tracking-wider font-normal">Tx Hash</th>
                  <th className="py-6 px-6 text-eyebrow text-fog uppercase tracking-wider font-normal">Cost (octas)</th>
                  <th className="py-6 px-6 text-eyebrow text-fog uppercase tracking-wider font-normal text-right">Keeper Bounty</th>
                </tr>
              </thead>
              <tbody className="text-body-xs text-bone">
                {renewals
                  .slice()
                  .reverse()
                  .map((r) => (
                    <tr key={r.txHash} className="border-b border-graphite hover:bg-carbon transition-colors">
                      <td className="py-6 px-6">{new Date(r.atSecs * 1000).toISOString().replace("T", " ").slice(0, 19)}</td>
                      <td className="py-6 px-6 text-ash font-mono">{truncate(r.txHash)}</td>
                      <td className="py-6 px-6">{r.data.cost}</td>
                      <td className="py-6 px-6 text-right text-copper">{r.data.bounty}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-onyx rounded-lg border border-graphite p-5 flex flex-col gap-1">
      <span className="text-eyebrow text-ash">{label}</span>
      <span className="text-body-sm text-primary">{value}</span>
    </div>
  );
}
