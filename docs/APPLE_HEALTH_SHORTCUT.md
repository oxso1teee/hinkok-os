# Apple Health → HinkoK OS

The integration accepts one daily snapshot from an iOS Shortcut. Repeating the
same date replaces only `daily_logs.notes.activity`; journal, nutrition, habits
and other daily data remain untouched.

## Endpoint

```text
POST https://YOUR_DOMAIN/api/health/activity
Content-Type: application/json
x-api-secret: YOUR_API_SECRET
```

Only `x-api-secret` authentication is accepted. A browser session cookie is not
enough for this route.

## JSON body

```json
{
  "date": "2026-07-18",
  "source": "apple_health",
  "recorded_at": "2026-07-18T21:30:00+03:00",
  "sleep_minutes": 450,
  "sleep_score": 86,
  "steps": 13127,
  "kcal_active": 322,
  "minutes_active": 88,
  "resting_hr": 55,
  "hrv": 37.8,
  "vo2_max": 46.7,
  "weight_kg": 72.3
}
```

`date` and at least one metric are required. Missing metrics may be omitted or
sent as `null`. Unknown fields, impossible ranges, timestamps without a timezone
offset, data more than five years old and future uploads are rejected.

## Shortcut outline

1. Use **Find Health Samples** once for each required metric, filtered to the
   current day. Aggregate steps, active calories, exercise minutes and sleep;
   use the latest value for weight, resting heart rate, HRV and VO2 max.
2. Build a Dictionary using the exact snake-case keys from the JSON example.
   Omit values that Health does not provide.
3. Add **Get Contents of URL** with method `POST`, request body `JSON`, and add
   the `x-api-secret` header.
4. Run the shortcut once every evening through a personal automation. Disable
   “Ask Before Running” only after a successful manual test.

The server stores the health snapshot before attempting its vector-memory
index. A temporary embedding outage therefore does not discard the Apple Health
data; the response reports `memoryIndexed: false` in that case.
