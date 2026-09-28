/**
 * Scores the New York Penn board's predicted tracks against the tracks NJ
 * Transit later posted, from the board log (lib/boardLog) — what riders
 * actually saw, when they saw it.
 *
 * One train on one day is one case. It counts when the board saw it before its
 * track was posted and then saw the posting:
 *
 *  - predicted: the board showed a predicted track at some point before posting
 *  - correct:   the last prediction before posting matched the posted track
 *  - precision = correct / predicted, recall = correct / cases, F1 of the two
 *  - misled:    a prediction shown at any point differed from the posted track
 *  - lead:      how long before posting the correct track was showing, unbroken
 *
 * Posting times are only as exact as the collector's interval (one minute).
 *
 * Usage:
 *   npm run penn-accuracy                         # last 14 days from Upstash
 *   npm run penn-accuracy -- --days 90
 *   npm run penn-accuracy -- --file log.json      # a JSON array of entries
 */
import { readFile } from "node:fs/promises";
import type { BoardLogEvent, TrainSnapshot } from "../lib/boardLog";

const PREFIX = "departure-board:penn-board-log:v1:";
const TIME_ZONE = "America/New_York";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function easternDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

async function redis<T>(command: Array<string | number>): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Pass --file or set UPSTASH_REDIS_REST_URL/TOKEN (in .env.local)");
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  const payload = (await response.json()) as { result?: T; error?: string };
  if (!response.ok || payload.error) throw new Error(`Upstash: ${response.status} ${payload.error ?? ""}`);
  return payload.result as T;
}

type Day = { day: string; events: BoardLogEvent[]; polls: Record<string, number> };

async function loadDays(): Promise<Day[]> {
  const file = arg("file");
  if (file) {
    const raw = JSON.parse(await readFile(file, "utf8")) as unknown[];
    const events = raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as BoardLogEvent);
    return [{ day: "file", events, polls: {} }];
  }
  const count = Number(arg("days") ?? 14);
  const days: Day[] = [];
  // One extra day first, so trains that started before the window are whole.
  for (let age = count; age >= 0; age -= 1) {
    const day = easternDay(Date.now() - age * 86_400_000);
    const [raw, flat] = await Promise.all([
      redis<string[]>(["LRANGE", `${PREFIX}${day}`, 0, -1]),
      redis<string[]>(["HGETALL", `${PREFIX}polls:${day}`]),
    ]);
    const polls: Record<string, number> = {};
    for (let i = 0; i + 1 < flat.length; i += 2) polls[flat[i]] = Number(flat[i + 1]);
    days.push({ day, events: raw.map((entry) => JSON.parse(entry) as BoardLogEvent), polls });
  }
  return days;
}

type Moment = TrainSnapshot & { at: string };

/** Each train's snapshots over time, rebuilt from its first entry and changes. */
function timelines(events: BoardLogEvent[]): Map<string, Moment[]> {
  const trains = new Map<string, Moment[]>();
  for (const event of events) {
    if (event.kind === "gone") continue;
    const id = event.id;
    const history = trains.get(id);
    if (event.kind === "first") {
      trains.set(id, [...(history ?? []), { ...event }]);
    } else if (history?.length) {
      // A change without an earlier first entry started before the window.
      history.push({ ...history[history.length - 1], ...event });
    }
  }
  return trains;
}

type Case = {
  id: string;
  month: string;
  line: string;
  posted: string;
  predicted: boolean;
  correct: boolean;
  misled: boolean;
  lastPrediction: string | null;
  lastConfidence: number | null;
  leadMinutes: number | null;
  changedAfterPosting: boolean;
};

function score(id: string, moments: Moment[]): Case | null {
  const postedIndex = moments.findIndex((moment) => moment.postedTrack);
  if (postedIndex <= 0) return null; // never posted, or posted before first seen
  const before = moments.slice(0, postedIndex);
  const posting = moments[postedIndex];
  const posted = posting.postedTrack!;
  const predictions = before.filter((moment) => moment.shownTrackKind === "predicted");
  const last = predictions.at(-1) ?? null;
  const lastBefore = before.at(-1)!;
  // The last prediction only counts if it was still showing when the track posted.
  const showingAtPosting = lastBefore.shownTrackKind === "predicted" ? lastBefore : null;
  const correct = showingAtPosting?.shownTrack === posted;

  let leadMinutes: number | null = null;
  if (correct) {
    let start = before.length - 1;
    while (start > 0 && before[start - 1].shownTrackKind === "predicted" && before[start - 1].shownTrack === posted) start -= 1;
    leadMinutes = (Date.parse(posting.at) - Date.parse(before[start].at)) / 60_000;
  }

  return {
    id,
    month: posting.scheduledTime.slice(0, 7),
    line: posting.line,
    posted,
    predicted: predictions.length > 0,
    correct,
    misled: predictions.some((moment) => moment.shownTrack !== posted),
    lastPrediction: last?.shownTrack ?? null,
    lastConfidence: last?.shownConfidence ?? null,
    leadMinutes,
    changedAfterPosting: moments.slice(postedIndex).some((moment) => moment.postedTrack && moment.postedTrack !== posted),
  };
}

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");

function wilson(successes: number, n: number): string {
  if (n === 0) return "—";
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return `${pct(Math.max(0, centre - half))}–${pct(Math.min(1, centre + half))}`;
}

function quantile(values: number[], q: number): string {
  if (values.length === 0) return "—";
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
}

function metrics(cases: Case[]) {
  const predicted = cases.filter((c) => c.predicted).length;
  const correct = cases.filter((c) => c.correct).length;
  const precision = correct / predicted;
  const recall = correct / cases.length;
  const leads = cases.flatMap((c) => (c.leadMinutes === null ? [] : [c.leadMinutes]));
  return {
    cases: cases.length,
    predicted,
    correct,
    precision: pct(precision),
    "precision 95% CI": wilson(correct, predicted),
    recall: pct(recall),
    f1: pct((2 * precision * recall) / (precision + recall)),
    "misled at any point": pct(cases.filter((c) => c.misled).length / cases.length),
    "lead min p25/p50/p75": `${quantile(leads, 0.25)} / ${quantile(leads, 0.5)} / ${quantile(leads, 0.75)}`,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

const days = await loadDays();
const cases = [...timelines(days.flatMap((day) => day.events))]
  .map(([id, moments]) => score(id, moments))
  .filter((c): c is Case => c !== null);

console.log("Collection coverage (minutes of the day with at least one board load):");
console.table(
  Object.fromEntries(
    days
      .filter((day) => day.day !== "file")
      .map((day) => {
        const minutes = new Set<string>();
        const healthy = new Set<string>();
        for (const field of Object.keys(day.polls)) {
          const [minute, , health] = field.split(":");
          minutes.add(minute);
          if (health === "ok") healthy.add(minute);
        }
        return [day.day, { minutes: minutes.size, "of 1440": pct(minutes.size / 1440), healthy: healthy.size }];
      }),
  ),
);

if (cases.length === 0) {
  console.log("\nNo trains yet seen both before and after their track was posted.");
  process.exit(0);
}

console.log("\nOverall:");
console.table({ all: metrics(cases) });

console.log("\nBy month (drift):");
console.table(Object.fromEntries([...groupBy(cases, (c) => c.month)].map(([month, group]) => [month, metrics(group)])));

console.log("\nBy line:");
console.table(Object.fromEntries([...groupBy(cases, (c) => c.line)].map(([line, group]) => [line, metrics(group)])));

console.log("\nCalibration — does the shown % match how often it was right?");
const bands = groupBy(
  cases.filter((c) => c.predicted && c.lastConfidence !== null),
  (c) => {
    const low = Math.min(90, Math.floor(c.lastConfidence! / 10) * 10);
    return `${low}–${low === 90 ? 99 : low + 9}%`;
  },
);
console.table(
  Object.fromEntries(
    [...bands]
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([band, group]) => {
        const right = group.filter((c) => c.lastPrediction === c.posted).length;
        return [band, { shown: group.length, right, "right %": pct(right / group.length), "95% CI": wilson(right, group.length) }];
      }),
  ),
);

const wrong = cases.filter((c) => c.predicted && !c.correct);
if (wrong.length) {
  console.log("\nWrong or withdrawn predictions (latest 30):");
  console.table(wrong.slice(-30).map(({ id, line, lastPrediction, lastConfidence, posted, changedAfterPosting }) => ({ id, line, predicted: lastPrediction, confidence: lastConfidence, posted, changedAfterPosting })));
}
