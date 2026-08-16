import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/runway.json" with { type: "json" };
import { applySplit, burnPerSec, cost, resolveSplit, runwaySecs } from "./runway.js";
import type { Split } from "./types.js";

describe("cost + burnPerSec", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      expect(cost(BigInt(c.sizeBytes), BigInt(c.durationSecs), BigInt(c.pricePerBytePerSec))).toBe(
        BigInt(c.expectedCost),
      );
      expect(burnPerSec(BigInt(c.sizeBytes), BigInt(c.pricePerBytePerSec))).toBe(BigInt(c.expectedBurnPerSec));
    });
  }
});

describe("runwaySecs", () => {
  for (const c of fixtures.runwayCases) {
    it(c.name, () => {
      expect(runwaySecs(BigInt(c.balance), BigInt(c.sizeBytes), BigInt(c.pricePerBytePerSec))).toBe(
        BigInt(c.expectedRunwaySecs),
      );
    });
  }
});

describe("applySplit", () => {
  for (const c of fixtures.splitCases) {
    it(c.name, () => {
      const split: Split = {
        rentBps: BigInt(c.split.rentBps),
        creatorBps: BigInt(c.split.creatorBps),
        protocolBps: BigInt(c.split.protocolBps),
      };
      const result = applySplit(BigInt(c.grossAmount), split);
      expect(result.rent).toBe(BigInt(c.expected.rent));
      expect(result.creator).toBe(BigInt(c.expected.creator));
      expect(result.protocol).toBe(BigInt(c.expected.protocol));
      expect(result.rent + result.creator + result.protocol).toBe(BigInt(c.grossAmount));
    });
  }

  it("never loses dust across 1000 random splits", () => {
    for (let i = 0; i < 1000; i++) {
      const gross = BigInt(Math.floor(Math.random() * 1_000_000_000));
      const protocolBps = BigInt(Math.floor(Math.random() * 500));
      const creatorBps = BigInt(Math.floor(Math.random() * (10_000n - protocolBps > 0n ? Number(10_000n - protocolBps) : 0)));
      const rentBps = 10_000n - protocolBps - creatorBps;
      const split: Split = { rentBps, creatorBps, protocolBps };
      const result = applySplit(gross, split);
      expect(result.rent + result.creator + result.protocol).toBe(gross);
      expect(result.rent).toBeGreaterThanOrEqual(0n);
    }
  });
});

describe("resolveSplit", () => {
  const configured: Split = { rentBps: 7000n, creatorBps: 2750n, protocolBps: 250n };
  const protocolBps = 250n;

  it("pays the creator normally once the blob is above target runway", () => {
    const { starved, split } = resolveSplit(600n, 300n, configured, protocolBps);
    expect(starved).toBe(false);
    expect(split).toEqual(configured);
  });

  it("cuts the creator out entirely while the blob is below target runway", () => {
    const { starved, split } = resolveSplit(100n, 300n, configured, protocolBps);
    expect(starved).toBe(true);
    expect(split.creatorBps).toBe(0n);
    expect(split.rentBps).toBe(10_000n - protocolBps);
  });

  it("treats exactly-at-target as safe, matching the strict comparison in endowment::credit", () => {
    expect(resolveSplit(300n, 300n, configured, protocolBps).starved).toBe(false);
  });

  it("always yields a split totalling 10000 bps", () => {
    for (const runway of [0n, 1n, 299n, 300n, 301n, 10_000n]) {
      const { split } = resolveSplit(runway, 300n, configured, protocolBps);
      expect(split.rentBps + split.creatorBps + split.protocolBps).toBe(10_000n);
    }
  });

  it("routes every octa to rent and protocol when starved", () => {
    const { split } = resolveSplit(0n, 300n, configured, protocolBps);
    const applied = applySplit(1_000_000n, split);
    expect(applied.creator).toBe(0n);
    expect(applied.rent + applied.protocol).toBe(1_000_000n);
  });
});
