"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";

export function fmtDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs > 3_000_000_000) return "∞";
  if (secs < 0) secs = 0;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

const TERMINAL_STATES = new Set(["Expired", "Dead", "Archived"]);

export interface RunwayMeterProps {
  label: string;
  state: string;
  runwaySecs: number;
  targetRunwaySecs: number;
  burnPerSec: number;
  lastDeltaSecs: number | null;
  href?: string;
}

export function RunwayMeter({ label, state, runwaySecs, targetRunwaySecs, burnPerSec, lastDeltaSecs, href }: RunwayMeterProps) {
  const [displaySecs, setDisplaySecs] = useState(runwaySecs);
  const [tick, setTick] = useState(0);
  const isTerminal = TERMINAL_STATES.has(state);

  // Ticks down in real time between polls.
  // Jumps to the authoritative value, with the gilded fill's transition, whenever fresh chain state lands.
  useEffect(() => {
    setDisplaySecs(runwaySecs);
  }, [runwaySecs]);

  // A terminal-state blob's on-chain runway number is frozen, not actually running out second by second.
  // Ticking it down locally would be a misleading animation over a number that never really moves, so hold it still instead.
  useEffect(() => {
    if (isTerminal) return;
    const id = setInterval(() => {
      setDisplaySecs((s) => (s > 3_000_000_000 ? s : Math.max(0, s - 1)));
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isTerminal]);

  const pct = targetRunwaySecs > 0 ? Math.min(100, (displaySecs / targetRunwaySecs) * 100) : 0;

  const content = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span className="text-eyebrow text-copper uppercase tracking-widest">{label}</span>
        <StatusBadge state={state} />
      </div>

      <div className="flex items-baseline gap-3 mb-3 relative">
        <span className="font-display text-headline-lg-mobile text-primary tabular-nums">{fmtDuration(displaySecs)}</span>
        {lastDeltaSecs !== null && lastDeltaSecs > 0 && (
          <span key={tick + lastDeltaSecs} className="animate-delta text-eyebrow text-copper">
            +{fmtDuration(lastDeltaSecs)}
          </span>
        )}
      </div>

      <div className="w-full h-1.5 bg-slate rounded-full overflow-hidden mb-3">
        <div className="h-full gilded-bg rounded-full transition-width duration-600 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <div className="text-body-xs text-fog">
        burn {burnPerSec}/s &middot; target {fmtDuration(targetRunwaySecs)}
      </div>
    </>
  );

  const cardClass = "bg-onyx border border-graphite rounded-lg p-6 block";

  if (href) {
    return (
      <a href={href} className={`${cardClass} hover:border-steel transition-colors`}>
        {content}
      </a>
    );
  }

  return <div className={cardClass}>{content}</div>;
}
