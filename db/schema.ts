// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("student"),
});
export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
});
export const progress = sqliteTable(
  "progress",
  {
    userId: text("user_id").notNull(),
    courseId: text("course_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    revision: integer("revision").notNull(),
    complete: integer("complete").notNull().default(0),
    quizPassed: integer("quiz_passed").notNull().default(0),
    codePassed: integer("code_passed").notNull().default(0),
    quizAttempts: integer("quiz_attempts").notNull().default(0),
    codeAttempts: integer("code_attempts").notNull().default(0),
    score: integer("score").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.lessonId] })],
);
export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    courseId: text("course_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    revision: integer("revision").notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull(),
    score: integer("score").notNull().default(0),
    data: text("data").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("attempts_user_course").on(t.userId, t.courseId)],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    body: text("body").notNull(),
    parentId: text("parent_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("messages_course_lesson").on(t.courseId, t.lessonId)],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    startsAt: text("starts_at").notNull(),
    duration: integer("duration").notNull(),
    location: text("location").notNull(),
    url: text("url").notNull(),
    capacity: integer("capacity").notNull(),
  },
  (t) => [index("sessions_course_start").on(t.courseId, t.startsAt)],
);
export const rsvps = sqliteTable(
  "rsvps",
  {
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);
