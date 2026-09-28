/**
 * Replays New York Penn position history to measure how often the board's
 * "on platform" track would have been right.
 *
 * Each recorded pairing is scored against the history as it stood just before
 * it: if the circuit already named a platform, that is a prediction, right or
 * wrong; otherwise the board would have shown no track. This is a proxy —
 * pairings are recorded after NJT posts the track, and the board only shows
 * predictions before — so treat it as an upper bound until predictions are
 * logged directly.
 *
 * Usage:
 *   npm run penn-backtest                                 # from Upstash
 *   npm run penn-backtest -- events.json                  # from a dump
 *
 * A dump is the JSON array of events (or of their JSON strings, as LRANGE
 * returns them) from `departure-board:penn-circuit-events:v1`.
 */
import { readFile } from "node:fs/promises";
import { MIN_AGREEMENT, MIN_SAMPLES, type PositionEvent } from "../lib/trainPositions";

const EVENTS_KEY = "departure-board:penn-circuit-events:v1";

async function loadEvents(path: string | undefined): Promise<PositionEvent[]> {
  let raw: unknown[];
  if (path) {
    raw = JSON.parse(await readFile(path, "utf8"));
  } else {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Pass an events file or set UPSTASH_REDIS_REST_URL/TOKEN");
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["LRANGE", EVENTS_KEY, 0, -1]),
    });
    const payload = (await response.json()) as { result?: string[]; error?: string };
    if (!response.ok || !payload.result) throw new Error(`Upstash: ${response.status} ${payload.error ?? ""}`);
    raw = payload.result;
  }
  return raw
    .map((item) => (typeof item === "string" ? JSON.parse(item) : item) as PositionEvent)
    .filter((event) => event?.circuit && event?.track && event?.recordedAt)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

type Thresholds = { minSamples: number; minAgreement: number };

function predict(counts: Map<string, number> | undefined, { minSamples, minAgreement }: Thresholds) {
  if (!counts) return null;
  let total = 0;
  let top: [string, number] | null = null;
  for (const entry of counts) {
    total += entry[1];
    if (!top || entry[1] > top[1]) top = entry;
  }
  return top && total >= minSamples && top[1] / total >= minAgreement ? top[0] : null;
}

type Score = { n: number; predicted: number; correct: number };

function replay(events: PositionEvent[], thresholds: Thresholds) {
  const table = new Map<string, Map<string, number>>();
  const events_: Score = { n: 0, predicted: 0, correct: 0 };
  // Per train-day: right if any pairing predicted its track and none predicted another.
  const trains = new Map<string, { predicted: boolean; wrong: boolean }>();
  const wrong: Array<PositionEvent & { predicted: string }> = [];

  for (const event of events) {
    const guess = predict(table.get(event.circuit), thresholds);
    events_.n += 1;
    const trainKey = `${event.trainNumber}|${event.scheduledTime.slice(0, 10)}`;
    const train = trains.get(trainKey) ?? { predicted: false, wrong: false };
    if (guess) {
      events_.predicted += 1;
      train.predicted = true;
      if (guess === event.track) events_.correct += 1;
      else {
        train.wrong = true;
        wrong.push({ ...event, predicted: guess });
      }
    }
    trains.set(trainKey, train);

    const counts = table.get(event.circuit) ?? new Map<string, number>();
    counts.set(event.track, (counts.get(event.track) ?? 0) + 1);
    table.set(event.circuit, counts);
  }

  const trainScore: Score = { n: trains.size, predicted: 0, correct: 0 };
  for (const { predicted, wrong: isWrong } of trains.values()) {
    if (predicted) trainScore.predicted += 1;
    if (predicted && !isWrong) trainScore.correct += 1;
  }
  return { events: events_, trains: trainScore, wrong, table };
}

/** Wilson 95% interval, so small samples do not read as certain. */
function wilson(successes: number, n: number): string {
  if (n === 0) return "—";
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return `${pct(Math.max(0, centre - half))}–${pct(Math.min(1, centre + half))}`;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function metrics({ n, predicted, correct }: Score) {
  const precision = predicted ? correct / predicted : 0;
  const recall = n ? correct / n : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    n,
    predicted,
    correct,
    precision: pct(precision),
    "precision 95% CI": wilson(correct, predicted),
    "recall (coverage × precision)": pct(recall),
    f1: pct(f1),
  };
}

const events = await loadEvents(process.argv[2]);
if (events.length === 0) {
  console.log("No position history recorded yet.");
  process.exit(0);
}
const first = events[0].recordedAt;
const last = events.at(-1)!.recordedAt;
console.log(`${events.length} pairings, ${first} → ${last}\n`);

const current = replay(events, { minSamples: MIN_SAMPLES, minAgreement: MIN_AGREEMENT });
console.log(`Current thresholds (≥${MIN_SAMPLES} pairings, ≥${pct(MIN_AGREEMENT)} agreement)`);
console.table({ "per pairing": metrics(current.events), "per train-day": metrics(current.trains) });

const circuits = [...current.table].map(([circuit, counts]) => {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const top = Math.max(...counts.values());
  return { circuit, total, tracks: counts.size, purity: pct(top / total) };
});
const pure = circuits.filter((c) => c.tracks === 1);
console.log(
  `\n${circuits.length} circuits: ${pure.length} only ever paired with one track, ` +
    `${circuits.length - pure.length} with several.`,
);
console.table(circuits.sort((a, b) => b.total - a.total).slice(0, 25));

if (current.wrong.length) {
  console.log("\nWrong predictions:");
  console.table(
    current.wrong.map(({ trainNumber, circuit, track, predicted, recordedAt }) => ({
      trainNumber,
      circuit,
      predicted,
      posted: track,
      recordedAt,
    })),
  );
}

console.log("\nThreshold sweep (per pairing):");
const sweep: Record<string, ReturnType<typeof metrics>> = {};
for (const minSamples of [1, 2, 3, 5, 10]) {
  for (const minAgreement of [0.8, 0.9, 0.95, 1]) {
    sweep[`n≥${minSamples}, agree≥${pct(minAgreement)}`] = metrics(
      replay(events, { minSamples, minAgreement }).events,
    );
  }
}
console.table(sweep);
