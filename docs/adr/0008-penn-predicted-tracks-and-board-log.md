---
status: accepted
---

# Predict every New York Penn track with a confidence, log what the board shows, and collect from a separate Worker

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
- **Board log.** Every collection logs what the NY board shows, per train: its
  first appearance in full, then a compact entry whenever anything a rider
  could see changes (posted track, predicted track or its confidence, times,
  status, circuit while inside Penn), then when it leaves the board.
  Collections are counted per minute so gaps show. Each day's log expires after
  90 days. `npm run penn-accuracy` turns it into precision, recall, F1, lead
  time, calibration of the shown percentages, and monthly figures to show
  drift.
- **A collector Worker, separate from the app.** A Cloudflare Worker
  (`collector/`) runs once a minute on the free plan's cron trigger. It calls
  NJ Transit's board and vehicle feed itself, records history, logs the board,
  and publishes the current predictions to Upstash with a 3-minute expiry.
  It is the only writer. The Vercel app keeps loading departures and posted
  tracks from NJ Transit as before, and for NY reads the published
  predictions — one Redis read per fresh board — ignoring any older than the
  expiry, so a stalled collector shows no predictions rather than stale ones.
  Nothing calls the app on a schedule, so it runs only for riders. Both share
  the one NJ Transit token stored in Upstash.
- **No history page.** `/train/[id]/positions` and its header button are
  removed; the feature's only rider-facing result is the track chip.

## Rejected

- **GitHub Actions schedule.** Runs are late or dropped (two in 30 hours), and
  Penn tracks post only 10–15 minutes before departure.
- **Vercel Cron.** Hobby allows one run a day, anywhere within the hour; Pro
  allows once a minute but is paid.
- **Anything that calls the app on a schedule** (an external pinger, or a
  timer in an always-on `next start`): every tick would spend Vercel function
  usage, and exceeding Hobby's limits pauses the whole site for up to 30 days.
- **Railway cron** runs at most every 5 minutes; an always-on Railway or Fly
  server costs money (Fly's waiver of small invoices is unofficial).
- **Scheduled-history guesses** (pennstation.fyi's "Likely · N%" from a train
  number's past tracks, 23.6% accurate) remain rejected; predictions come only
  from where the train is standing.

## Consequences

- Upstash free tier (256 MB, 500K commands and 10 GB bandwidth a month):
  entries measure about 600 bytes for a first appearance, 460 for a change and
  110 for leaving, roughly 3 KB per train a day. At about 400 Penn departures a
  day that is about 1.3 MB a day, about 120 MB over 90 days. The collector
  spends 3 commands a minute (token read, history script, log script), about
  130K a month counting each EVAL as one, plus one read per fresh NY board.
- Cloudflare Workers free plan: one cron trigger of the five allowed, 1,440
  runs a day, 10 ms of CPU per run. Parsing the system-wide vehicle feed is
  the heaviest step; if runs start exceeding the CPU limit, Workers Paid
  ($5/month) lifts it.
- NJ Transit: the collector makes two RailData calls a minute, about 2,900 a
  day, on top of riders' traffic, within the 40,000 daily limit.
- Predictions are up to a minute old; a posted track from the app's own
  NJ Transit call always replaces them at once.
- A low-confidence prediction can be wrong; the percentage says so, and the
  board log measures whether the percentages are honest.
- Position history restarted empty under new keys (v2).
