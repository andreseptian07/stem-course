// Node/MariaDB schema. The existing D1 schema remains in schema.ts.
import { mysqlTable, varchar, longtext, int, bigint, primaryKey, index } from "drizzle-orm/mysql-core";
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 191 }).primaryKey(),
  value: longtext("value").notNull(),
});
export const users = mysqlTable("users", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: longtext("name").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("student"),
});
export const profiles = mysqlTable("profiles", {
  userId: varchar("user_id", { length: 191 }).primaryKey(),
  data: longtext("data").notNull(),
  version: int("version").notNull().default(1),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
});
export const enrollments = mysqlTable(
  "enrollments",
  {
    userId: varchar("user_id", { length: 191 }).notNull(),
    courseId: varchar("course_id", { length: 191 }).notNull(),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);
export const courses = mysqlTable("courses", {
  id: varchar("id", { length: 191 }).primaryKey(),
  data: longtext("data").notNull(),
  version: int("version").notNull().default(1),
});
export const progress = mysqlTable(
  "progress",
  {
    userId: varchar("user_id", { length: 191 }).notNull(),
    courseId: varchar("course_id", { length: 191 }).notNull(),
    lessonId: varchar("lesson_id", { length: 191 }).notNull(),
    revision: int("revision").notNull(),
    complete: int("complete").notNull().default(0),
    quizPassed: int("quiz_passed").notNull().default(0),
    codePassed: int("code_passed").notNull().default(0),
    quizAttempts: int("quiz_attempts").notNull().default(0),
    codeAttempts: int("code_attempts").notNull().default(0),
    score: int("score").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.lessonId] })],
);
export const attempts = mysqlTable(
  "attempts",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    userId: varchar("user_id", { length: 191 }).notNull(),
    courseId: varchar("course_id", { length: 191 }).notNull(),
    lessonId: varchar("lesson_id", { length: 191 }).notNull(),
    revision: int("revision").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    state: varchar("state", { length: 32 }).notNull(),
    score: int("score").notNull().default(0),
    data: longtext("data").notNull(),
    pollAt: bigint("poll_at", { mode: "number" }).notNull().default(0),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [
    index("attempts_user_course").on(t.userId, t.courseId),
    index("attempts_user_time").on(t.userId, t.createdAt),
    index("attempts_code_state_time").on(t.kind, t.state, t.createdAt),
  ],
);
export const messages = mysqlTable(
  "messages",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    courseId: varchar("course_id", { length: 191 }).notNull(),
    lessonId: varchar("lesson_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).notNull(),
    name: longtext("name").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    body: longtext("body").notNull(),
    parentId: varchar("parent_id", { length: 191 }),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [index("messages_course_lesson").on(t.courseId, t.lessonId)],
);
export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    courseId: varchar("course_id", { length: 191 }).notNull(),
    title: longtext("title").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    startsAt: varchar("starts_at", { length: 32 }).notNull(),
    duration: int("duration").notNull(),
    location: longtext("location").notNull(),
    url: longtext("url").notNull(),
    capacity: int("capacity").notNull(),
  },
  (t) => [index("sessions_course_start").on(t.courseId, t.startsAt)],
);
export const rsvps = mysqlTable(
  "rsvps",
  {
    sessionId: varchar("session_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);

export const cohorts = mysqlTable("cohorts", {
  id: varchar("id", { length: 191 }).primaryKey(),
  courseId: varchar("course_id", { length: 191 }).notNull(),
  mentorId: varchar("mentor_id", { length: 191 }),
  name: longtext("name").notNull(),
  description: longtext("description").notNull().default(""),
  startsAt: varchar("starts_at", { length: 32 }),
  endsAt: varchar("ends_at", { length: 32 }),
  capacity: int("capacity").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  version: int("version").notNull().default(1),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
});
export const cohortMembers = mysqlTable(
  "cohort_members",
  {
    classId: varchar("class_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    index("cohort_members_user").on(t.userId, t.status),
  ],
);
export const cohortPosts = mysqlTable(
  "cohort_posts",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    classId: varchar("class_id", { length: 191 }).notNull(),
    userId: varchar("user_id", { length: 191 }).notNull(),
    name: longtext("name").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    body: longtext("body").notNull(),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [index("cohort_posts_class_time").on(t.classId, t.createdAt)],
);
export const cohortFeedback = mysqlTable(
  "cohort_feedback",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    classId: varchar("class_id", { length: 191 }).notNull(),
    studentId: varchar("student_id", { length: 191 }).notNull(),
    mentorId: varchar("mentor_id", { length: 191 }).notNull(),
    mentorName: longtext("mentor_name").notNull(),
    body: longtext("body").notNull(),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [
    index("cohort_feedback_recipient").on(t.classId, t.studentId, t.createdAt),
  ],
);
export const cohortSessions = mysqlTable(
  "cohort_sessions",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    classId: varchar("class_id", { length: 191 }).notNull(),
    title: longtext("title").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    startsAt: varchar("starts_at", { length: 32 }).notNull(),
    duration: int("duration").notNull(),
    location: longtext("location").notNull(),
    url: longtext("url").notNull(),
    version: int("version").notNull().default(1),
  },
  (t) => [index("cohort_sessions_class_time").on(t.classId, t.startsAt)],
);

export const classAssignments = mysqlTable(
  "class_assignments",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    classId: varchar("class_id", { length: 191 }).notNull(),
    title: longtext("title").notNull(),
    instructions: longtext("instructions").notNull(),
    dueAt: varchar("due_at", { length: 32 }),
    status: varchar("status", { length: 32 }).notNull(),
    version: int("version").notNull().default(1),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [index("assignments_class").on(t.classId, t.createdAt)],
);
export const projectSubmissions = mysqlTable(
  "project_submissions",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    assignmentId: varchar("assignment_id", { length: 191 }).notNull(),
    studentId: varchar("student_id", { length: 191 }).notNull(),
    attempt: int("attempt").notNull(),
    assignmentVersion: int("assignment_version").notNull(),
    instructions: longtext("instructions").notNull(),
    body: longtext("body").notNull(),
    url: longtext("url").notNull(),
    submittedAt: varchar("submitted_at", { length: 32 }).notNull(),
    late: int("late").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("submitted"),
    feedback: longtext("feedback").notNull().default(""),
    score: int("score"),
    reviewerName: longtext("reviewer_name"),
    reviewedAt: varchar("reviewed_at", { length: 32 }),
    version: int("version").notNull().default(1),
  },
  (t) => [
    index("submissions_assignment_student").on(
      t.assignmentId,
      t.studentId,
      t.attempt,
    ),
  ],
);

export const userAccess = mysqlTable("user_access", {
  userId: varchar("user_id", { length: 191 }).primaryKey(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  version: int("version").notNull().default(1),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
});
export const accessEvents = mysqlTable(
  "access_events",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    actorId: varchar("actor_id", { length: 191 }).notNull(),
    targetId: varchar("target_id", { length: 191 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    reason: longtext("reason").notNull(),
    createdAt: varchar("created_at", { length: 32 }).notNull(),
  },
  (t) => [index("access_events_time").on(t.createdAt)],
);
