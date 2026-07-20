import assert from "node:assert/strict";
import test from "node:test";

import { localCaptureTime } from "../src/lib/capture/time";

test("formats capture time with the configured timezone offset", () => {
  const result = localCaptureTime(
    new Date("2026-07-17T18:30:45.000Z"),
    "Europe/Riga",
  );

  assert.deepEqual(result, {
    date: "2026-07-17",
    time: "21:30",
    isoWithOffset: "2026-07-17T21:30:45+03:00",
  });
});
