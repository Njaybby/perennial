/**
 * Read profiles for the three demo blobs, chosen so a single run shows both ends of the lifecycle.
 *
 * Note that cold opens with the largest endowment of the three and still dies, while hot opens with the smallest and thrives.
 * That is the entire argument: what keeps a blob alive is demand, not how much its creator paid up front.
 * A renewal costs roughly 950 octas at these settings, so cold's 400 can never buy one, and no amount of waiting changes that without reads.
 */
export interface BlobProfile {
  label: string;
  sizeBytes: number;
  initialEndowment: number; // octas
  /** Credit this blob once every N demo ticks. null means it is never read and earns nothing. */
  creditEveryTicks: number | null;
  /** Gross revenue in octas per credit, before the rent/creator/protocol split. */
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
