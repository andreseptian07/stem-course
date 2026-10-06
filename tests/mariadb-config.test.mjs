import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../db/mariadb-schema.ts";
import { mariaDbOptions, mariaDbErrorMessage } from "../db/mariadb-config.ts";

const valid = {
  DB_HOST: "127.0.0.1", DB_USER: "test", DB_NAME: "stem_ci",
  DB_PASSWORD: "  spaces # symbols $ \" ' ",
};
test("MariaDB config preserves password and requires authenticated TLS by default", () => {
  const options = mariaDbOptions(valid);
  assert.equal(options.password, valid.DB_PASSWORD);
  assert.equal(options.port, 3306);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.verifyIdentity, true);
  assert.equal(options.multipleStatements, false);
  assert.deepEqual(options.flags, ["-FOUND_ROWS"]);
  assert.equal(options.connectionLimit, 3);
  assert.equal(options.queueLimit, 30);
});
test("missing credentials and invalid limits fail before opening a connection", () => {
  for (const key of ["DB_HOST", "DB_USER", "DB_NAME", "DB_PASSWORD"])
    assert.throws(() => mariaDbOptions({ ...valid, [key]: "" }), new RegExp(key));
  for (const raw of ["0", "-1", "3306x", "65536", "", "1.5"])
    assert.throws(() => mariaDbOptions({ ...valid, DB_PORT: raw }), /DB_PORT/);
  for (const raw of ["0", "21", "NaN", "1e2"])
    assert.throws(() => mariaDbOptions({ ...valid, DB_POOL_LIMIT: raw }), /DB_POOL_LIMIT/);
});
test("TLS cannot silently downgrade; CA needs explicit valid PEM configuration", () => {
  assert.throws(() => mariaDbOptions({ ...valid, DB_SSL_MODE: "preferred" }), /DB_SSL_MODE/);
  assert.throws(() => mariaDbOptions({ ...valid, DB_SSL_CA_BASE64: "junk" }), /sertifikat/);
  const ca = "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----";
  const encoded = Buffer.from(ca).toString("base64");
  assert.equal(mariaDbOptions({ ...valid, DB_SSL_CA_BASE64: encoded }).ssl.ca, ca);
  assert.throws(() => mariaDbOptions({ ...valid, DB_SSL_MODE: "disabled", DB_SSL_CA_BASE64: encoded }), /memerlukan/);
  assert.equal(mariaDbOptions({ ...valid, DB_SSL_MODE: "disabled" }).ssl, undefined);
});
test("operator errors never include driver messages, SQL or password", () => {
  const secret = "DO_NOT_PRINT_MY_PASSWORD";
  for (const code of ["ER_ACCESS_DENIED_ERROR", "ETIMEDOUT", "HANDSHAKE_SSL_ERROR", "ER_PARSE_ERROR", "unknown / invalid"]) {
    const error = Object.assign(new Error(secret), { code, sql: secret, password: secret });
    assert.ok(!mariaDbErrorMessage(error).includes(secret));
  }
  assert.ok(!mariaDbErrorMessage(new Error(`DB_PASSWORD=${secret}`)).includes(secret));
});
test("MariaDB schema preserves all platform tables, wide content and millisecond leases", () => {
  const tables = Object.values(schema).map(getTableConfig);
  assert.equal(tables.length, 22);
  assert.equal(tables.find((t) => t.name === "courses").columns.find((c) => c.name === "data").getSQLType(), "longtext");
  assert.equal(tables.find((t) => t.name === "attempts").columns.find((c) => c.name === "poll_at").getSQLType(), "bigint");
  const sql = fs.readFileSync("mariadb/0000_big_captain_marvel.sql", "utf8");
  assert.equal((sql.match(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin/g) || []).length, 19);
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/i.test(sql));
  const authSql = fs.readFileSync("mariadb/0001_sharp_vin_gonzales.sql", "utf8");
  assert.equal((authSql.match(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin/g) || []).length, 3);
});
