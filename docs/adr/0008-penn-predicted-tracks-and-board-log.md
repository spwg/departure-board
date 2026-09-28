---
status: accepted
---

# Predict every New York Penn track with a confidence, log what the board shows, and collect around the clock

ADR 0005 showed a history track only once a circuit's history was 95%
unanimous over at least 3 pairings, recorded that history from a GitHub
Actions schedule, and kept no record of what the board had shown. In its first
day the schedule ran twice and never recorded anything (its secrets were unset),
the 95% rule meant one dissenting pairing switched a platform off until about
20 more agreed, and with no record of predictions there was no way to measure
their precision or recall.

## Decision

- **Predicted tracks.** Any unposted New York Penn train whose signal circuit
  has history shows that circuit's most frequent track in grey, captioned with
  its confidence ("95% likely"). Confidence is Laplace's rule of succession,
  (agreeing + 1) / (pairings + 2), shown as a whole percent and never 100%:
  thin history reads as uncertain, and a dissenting pairing lowers it rather
  than switching it off. Posted tracks, at every station, are a soft green chip;
  the grey chip becomes the posted track in place when NJ Transit posts. Trains without a prediction
  show nothing about their position.
- **History only from inside Penn.** A pairing is recorded only while the
  train's coordinates are inside the station, so circuits in the tunnel or at
  Secaucus never enter the history.
- **History ages out after 90 days.** Pair counts are also kept per Eastern day;
  once a day is 90 days old it is subtracted from the running counts and
  deleted, so a circuit remapped during track work does not keep predicting its
  old track.
- **Board log.** Every fresh New York Penn board load logs what riders saw, per
  train: its first appearance in full, then a compact entry whenever anything
  visible changes (posted track, predicted track or its confidence, times,
  status, circuit while inside Penn), then when it leaves the board. Loads are
  counted per minute so collection gaps show. Each day's log expires after 90
  days. `npm run penn-accuracy` turns it into precision, recall, F1, lead time,
  calibration of the shown percentages, and monthly figures to show drift.
- **Always-on collector.** A timer inside the app (`instrumentation.ts`,
  `lib/pennCollector.ts`) loads the board every 30 seconds by requesting its own
  `/api/penn-positions/record`. It runs only where `PENN_COLLECTOR=true`, on a
  long-lived `next start` server; Vercel keeps serving riders.
- **No history page.** `/train/[id]/positions` and its header button are
  removed; the feature's only rider-facing result is the track chip.

## Rejected

- **GitHub Actions schedule.** Runs are late or dropped (two in 30 hours), and
  Penn tracks post only 10–15 minutes before departure.
- **Vercel Cron.** Hobby allows one run a day, anywhere within the hour; Pro
  allows once a minute but is paid.
- **A timer on Vercel.** Functions are frozen between requests, so the timer
  would silently stop.
- **Scheduled-history guesses** (pennstation.fyi's "Likely · N%" from a train
  number's past tracks, 23.6% accurate) remain rejected; predictions come only
  from where the train is standing.

## Consequences

- Upstash free tier (256 MB, 500K commands and 10 GB bandwidth a month):
  entries measure about 600 bytes for a first appearance, 460 for a change and
  110 for leaving, roughly 3 KB per train a day. At about 400 Penn departures a
  day that is about 1.3 MB a day with the minute counts, about 120 MB over 90
  days. The collector spends about 4,000 commands a day (one scripted write per
  load, history refreshes), about 120K a month, counting each EVAL as one
  command, and about 2.5 GB of bandwidth a month.
- NJ Transit: two RailData calls per load, about 5,800 a day, within the 40,000
  daily limit.
- A low-confidence prediction can be wrong; the percentage says so, and the
  board log measures whether the percentages are honest.
- Position history restarted empty under new keys (v2).
