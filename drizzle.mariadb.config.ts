import { defineConfig } from "drizzle-kit";

// Generating SQL does not connect to Hostinger or require the password.
export default defineConfig({
  out: "./mariadb",
  schema: "./db/mariadb-schema.ts",
  dialect: "mysql",
});
