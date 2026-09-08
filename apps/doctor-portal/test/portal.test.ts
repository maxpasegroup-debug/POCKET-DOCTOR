import test from "node:test";
import assert from "node:assert/strict";
import { ApiClient, validateApiBase } from "../src/api.ts";

test('API configuration rejects insecure remote transport and URL secrets', () => {
  assert.equal(validateApiBase('https://api.example.test/api/v1/'), 'https://api.example.test/api/v1');
  assert.equal(validateApiBase('http://127.0.0.1:3000/api/v1'), 'http://127.0.0.1:3000/api/v1');
  assert.throws(() => validateApiBase('http://127.0.0.1:3000/api/v1', true));
  assert.equal(validateApiBase('https://api.example.test/api/v1', true), 'https://api.example.test/api/v1');
  for (const value of ['http://example.test/api/v1', 'https://user:secret@example.test/api/v1', 'https://example.test/api/v1?secret=x', 'https://example.test/#token'])
    assert.throws(() => validateApiBase(value));
});
import {
  agenda,
  minute,
  validateAvailability,
  type Appointment,
  type Availability,
} from "../src/models.ts";

test("default transport uses the global fetch receiver", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: unknown) {
    assert.equal(this, globalThis);
    return Response.json({ data: { saved: true } });
  };
  try {
    assert.deepEqual(await new ApiClient("", () => {}).request("/"), {
      saved: true,
    });
  } finally {
    globalThis.fetch = original;
  }
});
test("availability validates timezone, real dates, overlap and midnight", () => {
  const valid: Availability = {
    timezone: "Asia/Kolkata",
    consultationMinutes: 20,
    bufferMinutes: 5,
    acceptingAppointments: true,
    windows: [{ weekday: 1, startMinute: 1380, endMinute: minute("24:00") }],
    excludedDates: ["2026-09-08"],
  };
  assert.equal(validateAvailability(valid).windows[0]?.endMinute, 1440);
  assert.throws(() => minute("09:99"), /HH:MM/);
  assert.throws(
    () => validateAvailability({ ...valid, timezone: "Invalid/Zone" }),
    /timezone/,
  );
  assert.throws(
    () => validateAvailability({ ...valid, excludedDates: ["2026-02-30"] }),
    /valid unavailable/,
  );
  assert.throws(
    () =>
      validateAvailability({
        ...valid,
        windows: [...valid.windows, ...valid.windows],
      }),
    /overlap/,
  );
});
test("API unwraps data and sends bearer in headers", async () => {
  let headers: HeadersInit | undefined;
  const api = new ApiClient(
    "https://example.test",
    () => {},
    async (_url, init) => {
      headers = init?.headers;
      return Response.json({ data: { saved: true } });
    },
  );
  api.setToken("private");
  assert.deepEqual(await api.request("/doctor/profile"), { saved: true });
  assert.equal(
    (headers as Record<string, string>).Authorization,
    "Bearer private",
  );
});
test("401 clears token and private state", async () => {
  let resets = 0;
  let calls = 0;
  const api = new ApiClient(
    "",
    () => resets++,
    async (_url, init) => {
      calls++;
      if (calls === 1) return new Response(null, { status: 401 });
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        undefined,
      );
      return Response.json({ data: {} });
    },
  );
  api.setToken("private");
  await assert.rejects(api.request("/doctor/profile"), /session has ended/);
  assert.equal(resets, 1);
  await api.request("/doctor/profile");
});
test("stale responses cannot restore signed-out data", async () => {
  let resolve!: (r: Response) => void;
  const api = new ApiClient(
    "",
    () => {},
    () => new Promise((r) => (resolve = r)),
  );
  api.setToken("private");
  const request = api.request("/doctor/appointments");
  api.clear();
  resolve(Response.json({ data: { consultations: ["private"] } }));
  await assert.rejects(request, /session has changed/);
});
test("errors do not expose backend details", async () => {
  const api = new ApiClient(
    "",
    () => {},
    async () =>
      Response.json({ error: { message: "SQL secret" } }, { status: 500 }),
  );
  await assert.rejects(
    api.request("/"),
    (e) => e instanceof Error && !e.message.includes("SQL"),
  );
});
test("agenda today follows doctor timezone", () => {
  const a = {
    startsAt: "2026-09-07T20:00:00Z",
    endsAt: "2026-09-07T20:30:00Z",
    status: "CONFIRMED",
  } as Appointment;
  assert.equal(
    agenda([a], "Today", "Asia/Kolkata", new Date("2026-09-08T01:00:00Z"))
      .length,
    1,
  );
  assert.equal(agenda([a], "Completed", "Asia/Kolkata").length, 0);
});
