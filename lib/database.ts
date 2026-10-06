export type DatabaseValue = string | number | boolean | null;
export type WriteResult = { meta: { changes: number } };

export interface DatabaseStatement {
  bind(...values: DatabaseValue[]): DatabaseStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<WriteResult>;
}

// D1 is structurally compatible; its existing callers need no runtime wrapper.
export interface PlatformDatabase {
  readonly dialect?: "sqlite" | "mariadb";
  prepare(sql: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<WriteResult[]>;
}

export function databaseSql(d: PlatformDatabase, sqlite: string, mariaDb: string): string {
  return d.dialect === "mariadb" ? mariaDb : sqlite;
}
