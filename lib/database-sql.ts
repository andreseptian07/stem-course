import { databaseSql, type PlatformDatabase } from "./database.ts";

// Only fixed, internal column names are accepted. User values stay in bindings.
type CourseJsonColumn = "data" | "c.data" | "k.data";
export function courseTitleSql(d: PlatformDatabase, column: CourseJsonColumn) {
  return databaseSql(d, `json_extract(${column},'$.title')`,
    `JSON_UNQUOTE(JSON_EXTRACT(${column},'$.title'))`);
}
export function publishedSql(d: PlatformDatabase, column: CourseJsonColumn) {
  return databaseSql(d, `json_extract(${column},'$.published')=1`,
    `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${column},'$.published')) IN ('true','1'),0)`);
}
export function upcomingSessionSql(d: PlatformDatabase) {
  return databaseSql(d,
    "datetime(s.starts_at,'+' || s.duration || ' minutes')>datetime(?)",
    "DATE_ADD(CAST(REPLACE(REPLACE(s.starts_at,'T',' '),'Z','') AS DATETIME(6)), INTERVAL s.duration MINUTE)>CAST(REPLACE(REPLACE(?,'T',' '),'Z','') AS DATETIME(6))");
}
