// Local mock-sign-in only; changes access of a disposable local fixture, never the owner.
import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const sign = await fetch(base + "/signin-with-chatgpt?return_to=/access", {
  redirect: "manual",
});
const cookie = sign.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
async function api(body, origin = base, extra = {}) {
  const r = await fetch(base + "/api/access", {
    headers: {
      Cookie: cookie,
      ...extra,
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw };
  }
  return { status: r.status, data };
}
assert.equal((await fetch(base + "/api/access")).status, 401);
const initial = await api();
assert.equal(initial.status, 200);
assert.equal(initial.data.user.role, "owner");
const owner = initial.data.users.find((u) => u.role === "owner");
assert.equal(
  (
    await api({
      userId: owner.id,
      version: owner.version,
      status: "suspended",
      reason: "self lockout test",
    })
  ).status,
  400,
);
const target = initial.data.users.find((u) => u.id === "access-demo-local");
assert.ok(target, "Create the named local fixture first");
const b = {
  userId: target.id,
  version: target.version,
  status: "active",
  reason: "Uji lokal: persetujuan kelas percobaan",
};
assert.equal((await api(b, "https://example.com")).status, 403);
assert.equal((await api({ ...b, role: "owner" })).status, 400);
assert.equal((await api(b)).status, 200);
assert.equal((await api(b)).status, 409);
const result = await api();
assert.equal(
  result.data.users.find((u) => u.id === target.id).status,
  "active",
);
assert.ok(
  result.data.events.some(
    (e) => e.targetId === target.id && e.reason === b.reason,
  ),
);
const forged = await api(undefined, base, {
  "oai-authenticated-user-id": "attacker",
  "oai-authenticated-user-email": "attacker@example.com",
});
assert.equal(forged.data.user.id, initial.data.user.id);
const cross = await fetch(base + "/api/access", {
  headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
});
assert.equal(cross.status, 403);
const headers = await fetch(base + "/api/account", {
  headers: { Cookie: cookie },
});
assert.equal(headers.headers.get("x-content-type-options"), "nosniff");
assert.equal(headers.headers.get("referrer-policy"), "no-referrer");
assert.ok(headers.headers.get("cache-control").includes("no-store"));
console.log(
  "Access API: auth, origin, forged headers, owner lockout, strict inputs, audit, conflict and security headers passed (localhost only).",
);
