import { DatabaseExecutionError } from "../db/mariadb-adapter.ts";

// A lost COMMIT response does not prove that saving failed. Never instruct
// the user to submit again before checking the persisted result.
export function databaseFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof DatabaseExecutionError && error.writeOutcome === "unknown")
    return "Hasil penyimpanan belum dapat dipastikan. Muat ulang data dan periksa hasil sebelum mencoba menyimpan lagi.";
  return fallback;
}
