<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## NJ Transit RailData testing

For local integration testing, prefer NJ Transit's test backend so production
`getToken` quota is not consumed. Start it with `npm run dev:njt-test`, which
sets `NJT_API_BASE_URL=https://testraildata.njtransit.com/api` while reading
credentials from ignored `.env.local`. Do not place credentials in tracked
files or expose them in command output. Restart the dev server after changing
environment variables, then verify one station with
`curl http://127.0.0.1:3000/api/departures/NY`; a live test response reports
`"fixtures":false`. Use `npm run dev` only when production RailData behavior
is specifically required.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.
