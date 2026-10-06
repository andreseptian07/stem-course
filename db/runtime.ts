import { createMariaDb } from "./mariadb.ts";
// One pool/adapter per Node process, including development hot reloads.
const state = globalThis as typeof globalThis & { stemMariaDb?: ReturnType<typeof createMariaDb> };
export function runtimeDatabase() {
  state.stemMariaDb ??= createMariaDb();
  return state.stemMariaDb.database;
}
