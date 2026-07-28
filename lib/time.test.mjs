import assert from "node:assert/strict";
import test from "node:test";
import { formatTime } from "./time.ts";

const EVENING_DEPARTURE = "2024-05-30T23:04:00.000Z";
const NJT_TIME_ZONE = "America/New_York";

test("formats station time in the viewer's 12-hour convention", () => {
  assert.equal(
    formatTime(EVENING_DEPARTURE, NJT_TIME_ZONE, { locales: "en-US", hourCycle: "h12" }),
    "7:04 PM",
  );
});

test("uses 24-hour time when the device reports a 24-hour preference", () => {
  assert.equal(
    formatTime(EVENING_DEPARTURE, NJT_TIME_ZONE, { locales: "en-US", hourCycle: "h23" }),
    "19:04",
  );
});
