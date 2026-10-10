import {authorizationDatabase,seedAccessUser} from "./authorization-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { inviteSchema, activationSchema, tutorMutation } from "../lib/tutors.ts";
import { courseFromReturnPath } from "../lib/auth-policy.ts";
import { registrationEnabled, setRegistration } from "../lib/registration.ts";

test("invitation payloads cannot choose roles, account IDs, issuer, tokens or expiry", () => {
  const invitation = { email: " Tutor@Example.com ", displayName: " Tutor ", classId: null };
  assert.equal(inviteSchema.parse(invitation).email, "tutor@example.com");
  for (const key of ["role", "userId", "createdBy", "token", "expiresAt"])
    assert.equal(inviteSchema.safeParse({ ...invitation, [key]: "owner" }).success, false);
  assert.equal(inviteSchema.safeParse({ ...invitation, classId: "../private" }).success, false);
  const activation = { token: "A".repeat(43), email: "tutor@example.com", password: "a unique tutor password" };
  assert.equal(activationSchema.safeParse(activation).success, true);
  assert.equal(activationSchema.safeParse({ ...activation, token: "short" }).success, false);
  assert.equal(activationSchema.safeParse({ ...activation, role: "owner" }).success, false);
  assert.equal(tutorMutation.safeParse({ action: "revokeTutor", userId: "user", reason: "" }).success, false);
});
test("only safe course return paths preserve enrollment intent", () => {
  assert.equal(courseFromReturnPath("/dashboard?join=esp32-starter"), "esp32-starter");
  for (const path of ["https://evil.example/dashboard?join=esp32", "//evil.example/dashboard?join=esp32", "/api/auth?join=esp32", "/dashboard?join=../owner", "/login?join=esp32"])
    assert.equal(courseFromReturnPath(path), undefined);
});
test("owner registration preference takes priority over a normalized environment fallback", async () => {
  let setting = null;
  const d = { prepare() { return { bind() { return this; }, async first() { return setting; } }; } };
  assert.equal(await registrationEnabled(d, { AUTH_REGISTRATION_ENABLED: " TRUE " }), true);
  setting = { value: "false" };
  assert.equal(await registrationEnabled(d, { AUTH_REGISTRATION_ENABLED: "true" }), false);
  setting = { value: "true" };
  assert.equal(await registrationEnabled(d, { AUTH_REGISTRATION_ENABLED: "false" }), true);
  setting = { value: "owner" };
  const f=authorizationDatabase();try{await seedAccessUser(f.d,"student","student");await f.d.prepare("INSERT INTO settings(key,value) VALUES('owner','someone-else')").run();await assert.rejects(()=>setRegistration(f.d,{id:"student"},{enabled:true}),e=>e.status===403);}finally{f.sql.close();}
});
