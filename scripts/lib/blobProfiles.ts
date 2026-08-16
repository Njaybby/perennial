/**
 * The three demo blobs: seeds three blobs with different read profiles and runs them forward until one dies and one becomes self sustaining.
 * Constants are minutes, not days, since real devnet timestamps are real wall-clock time and the chain won't fast-forward.
 */
export interface BlobProfile {
  label: string;
  sizeBytes: number;
  initialEndowment: number; // octas
  /** Credits landing on this blob during the demo: [amount octas, every N ticks]. null = never credited. */
  creditEveryTicks: number | null;
  creditAmount: number;
  rentBps: number;
  creatorBps: number;
  protocolBps: number;
}

export const BLOB_PROFILES: BlobProfile[] = [
  {
    label: "hot",
    sizeBytes: 5000,
    initialEndowment: 200,
    creditEveryTicks: 1,
    creditAmount: 3000,
    rentBps: 7000,
    creatorBps: 2750,
    protocolBps: 250,
  },
  {
    label: "warm",
    sizeBytes: 5000,
    initialEndowment: 300,
    creditEveryTicks: 4,
    creditAmount: 800,
    rentBps: 7000,
    creatorBps: 2750,
    protocolBps: 250,
  },
  {
    label: "cold",
    sizeBytes: 5000,
    initialEndowment: 400,
    creditEveryTicks: null,
    creditAmount: 0,
    rentBps: 7000,
    creatorBps: 2750,
    protocolBps: 250,
  },
];
