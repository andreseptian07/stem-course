import { databaseSql, type PlatformDatabase } from "./database.ts";

// Fixed users alias; never interpolate a caller-provided SQL expression.
export const profileNameSql = (d: PlatformDatabase) => databaseSql(d,
  "COALESCE(NULLIF(json_extract((SELECT data FROM profiles WHERE user_id=u.id),'$.displayName'),''),u.name)",
  "COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT((SELECT data FROM profiles WHERE user_id=u.id),'$.displayName')),''),u.name)");
