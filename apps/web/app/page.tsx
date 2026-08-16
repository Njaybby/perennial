"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LIFECYCLE_STATES } from "@perennial/core";
import { RunwayMeter } from "./components/RunwayMeter";

const STATE_POLL_MS = 2000;
const DEMO_POLL_MS = 1500;

interface BlobRow {
  label: string;
  endowmentAddress: string;
  blobId: string;
  sizeBytes: number;
  state: number;
  balance: string;
  creatorClaimable: string;
  lifetimeRevenue: string;
  reads: string;
  renewals: string;
  runwaySecs: string;
  targetRunwaySecs: string;
  rentBps: number;
  creatorBps: number;
  protocolBps: number;
  error?: string;
}

export default function Page() {
  const [blobs, setBlobs] = useState<BlobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevRunway = useRef<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  const [demoRunning, setDemoRunning] = useState(false);
  const [demoLog, setDemoLog] = useState("");
  const [demoError, setDemoError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

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
        const nextDeltas: Record<string, number> = {};
        for (const b of json.blobs as BlobRow[]) {
          if (b.error) continue;
          const prev = prevRunway.current[b.label];
          const cur = Number(b.runwaySecs);
          if (prev !== undefined && cur > prev) nextDeltas[b.label] = cur - prev;
          prevRunway.current[b.label] = cur;
        }
        setDeltas(nextDeltas);
        setBlobs(json.blobs);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    poll();
    const id = setInterval(poll, STATE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/demo", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        setDemoRunning(Boolean(json.running));
        setDemoLog(json.log ?? "");
      } catch {
        // Swallowed deliberately: this polls every second and a half, so a transient failure resolves itself on the next tick.
      }
    }
    poll();
    const id = setInterval(poll, DEMO_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [demoLog]);

  async function runDemo() {
    setDemoError(null);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setDemoError(json.error ?? "Failed to start the demo.");
        return;
      }
      setDemoRunning(true);
    } catch (err) {
      setDemoError(String(err));
    }
  }

  const validBlobs = (blobs ?? []).filter((b) => !b.error);
  const featured = [...validBlobs].sort((a, b) => Number(b.lifetimeRevenue) - Number(a.lifetimeRevenue))[0];
  const totalRevenue = validBlobs.reduce((sum, b) => sum + Number(b.lifetimeRevenue), 0);
  const selfSustaining = validBlobs.filter((b) => b.state === 1).length;

  return (
    <main className="max-w-(--spacing-max-width) mx-auto px-6 md:px-10">
      {/* Hero */}
      <section className="flex flex-col lg:flex-row gap-12 items-center min-h-[560px] pt-24">
        <div className="flex-1 space-y-8">
          <h1 className="font-display text-display text-primary max-w-xl">Storage that pays its own rent.</h1>
          <p className="text-body-lg text-fog max-w-lg">
            Every read routes revenue into the blob&apos;s own endowment. A keeper renews the lease out of that
            vault before it expires. Data that people read funds its own permanence. Data nobody reads runs down
            its runway and dies.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={runDemo}
              disabled={demoRunning}
              className="bg-primary text-obsidian text-eyebrow font-semibold px-6 py-3 rounded-full disabled:bg-slate disabled:text-fog"
            >
              {demoRunning ? "Demo running…" : "Run demo"}
            </button>
            <Link href="/demand-index" className="text-eyebrow text-fog hover:text-primary transition-colors border border-steel rounded-full px-6 py-3">
              View demand index
            </Link>
          </div>
          {demoError && <div className="text-copper text-body-xs">{demoError}</div>}
        </div>

        <div className="flex-1 w-full max-w-lg">
          {featured ? (
            <RunwayMeter
              label={featured.label}
              state={LIFECYCLE_STATES[featured.state] ?? "Unknown"}
              runwaySecs={Number(featured.runwaySecs)}
              targetRunwaySecs={Number(featured.targetRunwaySecs)}
              burnPerSec={Number(featured.runwaySecs) > 0 ? Math.floor(Number(featured.balance) / Number(featured.runwaySecs)) : 0}
              lastDeltaSecs={deltas[featured.label] ?? null}
              href={`/blob/${featured.endowmentAddress}`}
            />
          ) : (
            <div className="bg-onyx border border-graphite rounded-lg p-6 text-fog text-body-xs">
              {error ?? "Loading on-chain state…"}
            </div>
          )}
        </div>
      </section>

      {(demoRunning || demoLog) && (
        <div className="bg-onyx border border-graphite rounded-lg p-6 my-16">
          <span className="text-eyebrow text-copper uppercase tracking-widest block mb-3">
            {demoRunning ? "Live activity" : "Last run"}
          </span>
          <pre ref={logRef} className="m-0 max-h-64 overflow-y-auto font-mono text-body-xs text-bone whitespace-pre-wrap break-all">
            {demoLog || "Waiting for output…"}
          </pre>
        </div>
      )}

      {/* Stats band */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 py-16 border-y border-graphite mt-24">
        <Stat value={validBlobs.length.toLocaleString()} label="Blobs Endowed" />
        <Stat value={totalRevenue.toLocaleString()} label="Octas Routed to Rent" />
        <Stat value={selfSustaining.toLocaleString()} label="Self-Sustaining" />
      </section>

      {/* Mechanic cards */}
      <section className="my-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        <MechanicCard
          eyebrow="Mechanic"
          title="Adaptive Revenue Split"
          body="Every paid read routes a share of its revenue into the blob's own vault. The split is adaptive: rent has priority until the blob clears its target runway, then the creator starts getting paid."
        />
        <MechanicCard
          eyebrow="Economics"
          title="Runway, Not Rent"
          body="Balance divided by burn rate is the number that matters. Read enough and it climbs without bound. Read nothing and it runs out, on schedule, with no one to blame."
        />
        <MechanicCard
          eyebrow="Trust"
          title="Permissionless Renewal"
          body="Anyone can call renew before a lease expires and earn the keeper bounty for doing it. No server has to stay up, and no company has to stay solvent, for a blob to survive."
        />
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-headline-lg text-primary">{value}</span>
      <span className="text-eyebrow text-fog uppercase tracking-widest mt-2">{label}</span>
    </div>
  );
}

function MechanicCard({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="bg-carbon border border-slate p-8 rounded-lg flex flex-col hover:border-steel transition-colors">
      <span className="text-eyebrow text-copper uppercase tracking-widest mb-4">{eyebrow}</span>
      <h3 className="font-display text-subheading text-primary mb-3">{title}</h3>
      <p className="text-body-xs text-fog flex-1">{body}</p>
    </div>
  );
}
