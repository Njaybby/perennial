"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LIFECYCLE_STATES } from "@perennial/core/types";
import { fmtDuration } from "../components/RunwayMeter";
import { StatusBadge } from "../components/StatusBadge";

const SORTS = ["Demand", "Runway", "Revenue", "Newest"] as const;
type Sort = (typeof SORTS)[number];

interface BlobRow {
  label: string;
  endowmentAddress: string;
  blobId: string;
  sizeBytes: number;
  state: number;
  balance: string;
  lifetimeRevenue: string;
  reads: string;
  runwaySecs: string;
  targetRunwaySecs: string;
  createdAtSecs: string;
  error?: string;
}

export default function DemandIndexPage() {
  const [blobs, setBlobs] = useState<BlobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("Demand");
  const [query, setQuery] = useState("");

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
    const valid = (blobs ?? []).filter((b) => !b.error && b.label.toLowerCase().includes(query.toLowerCase()));
    const sorted = [...valid];
    // "Demand" approximates a real demand formula (revenue EMA + reads EMA + recency, percentile-ranked against an active cohort) with lifetime revenue.
    // The indexer where that formula would actually run is design-only in this build.
    if (sort === "Demand" || sort === "Revenue") sorted.sort((a, b) => Number(b.lifetimeRevenue) - Number(a.lifetimeRevenue));
    else if (sort === "Runway") sorted.sort((a, b) => Number(b.runwaySecs) - Number(a.runwaySecs));
    else if (sort === "Newest") sorted.sort((a, b) => Number(b.createdAtSecs) - Number(a.createdAtSecs));
    return sorted;
  }, [blobs, sort, query]);

  return (
    <main className="max-w-(--spacing-max-width) mx-auto px-6 md:px-10 pt-16 pb-24">
      <header className="mb-16">
        <h1 className="font-display text-heading text-primary mb-4">The Demand Index</h1>
        <p className="text-subheading font-light text-fog">The native ranking of data that matters.</p>
      </header>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div className="flex flex-wrap gap-3">
          {SORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`text-eyebrow px-4 py-2 rounded-full border transition-colors ${
                sort === s ? "bg-graphite text-primary border-steel" : "bg-obsidian text-fog border-graphite hover:border-steel hover:text-primary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search index…"
          className="w-full md:w-64 bg-carbon border border-graphite rounded-full py-2 px-4 text-body-xs text-primary placeholder-fog focus:outline-none focus:border-steel"
        />
      </div>

      {error && <div className="text-copper text-body-xs mb-8">{error}</div>}
      {!error && !blobs && <div className="text-fog">Loading on-chain state…</div>}

      {rows.length > 0 && (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-graphite text-fog text-eyebrow uppercase tracking-wider">
                <th className="py-7 pl-2 pr-6 w-16 text-center">Rank</th>
                <th className="py-7 px-6">Blob</th>
                <th className="py-7 px-6 text-right">Size (bytes)</th>
                <th className="py-7 px-6 text-right">Lifetime Revenue</th>
                <th className="py-7 px-6 text-right">Reads</th>
                <th className="py-7 px-6 w-48">Runway</th>
                <th className="py-7 px-6 text-center">State</th>
              </tr>
            </thead>
            <tbody className="text-body-sm">
              {rows.map((b, i) => {
                const pct = Number(b.targetRunwaySecs) > 0 ? Math.min(100, (Number(b.runwaySecs) / Number(b.targetRunwaySecs)) * 100) : 0;
                return (
                  <tr key={b.endowmentAddress} className="border-b border-graphite hover:bg-onyx transition-colors">
                    <td className="py-7 pl-2 pr-6 text-center text-primary font-bold">{i + 1}</td>
                    <td className="py-7 px-6">
                      <Link href={`/blob/${b.endowmentAddress}`} className="text-primary font-medium tracking-tight hover:text-copper transition-colors">
                        {b.label}
                      </Link>
                    </td>
                    <td className="py-7 px-6 text-right text-silver text-body-xs">{b.sizeBytes.toLocaleString()}</td>
                    <td className="py-7 px-6 text-right text-primary">{Number(b.lifetimeRevenue).toLocaleString()}</td>
                    <td className="py-7 px-6 text-right text-silver text-body-xs">{b.reads}</td>
                    <td className="py-7 px-6">
                      <div className="flex flex-col gap-2 w-full max-w-[140px]">
                        <div className="w-full h-1 bg-graphite rounded-full overflow-hidden">
                          <div className="h-full gilded-bg" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-eyebrow text-fog text-[10px]">{fmtDuration(Number(b.runwaySecs))}</span>
                      </div>
                    </td>
                    <td className="py-7 px-6 text-center">
                      <StatusBadge state={LIFECYCLE_STATES[b.state] ?? "Unknown"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
