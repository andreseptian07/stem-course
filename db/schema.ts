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
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const enrollments = sqliteTable(
  "enrollments",
  {
    userId: text("user_id").notNull(),
    courseId: text("course_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);
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
    pollAt: integer("poll_at").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("attempts_user_course").on(t.userId, t.courseId),
    index("attempts_user_time").on(t.userId, t.createdAt),
    index("attempts_code_state_time").on(t.kind, t.state, t.createdAt),
  ],
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

export const cohorts = sqliteTable("cohorts", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull(),
  mentorId: text("mentor_id"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("open"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
});
export const cohortMembers = sqliteTable(
  "cohort_members",
  {
    classId: text("class_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    index("cohort_members_user").on(t.userId, t.status),
  ],
);
export const cohortPosts = sqliteTable(
  "cohort_posts",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("cohort_posts_class_time").on(t.classId, t.createdAt)],
);
export const cohortFeedback = sqliteTable(
  "cohort_feedback",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull(),
    studentId: text("student_id").notNull(),
    mentorId: text("mentor_id").notNull(),
    mentorName: text("mentor_name").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("cohort_feedback_recipient").on(t.classId, t.studentId, t.createdAt),
  ],
);
export const cohortSessions = sqliteTable(
  "cohort_sessions",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    startsAt: text("starts_at").notNull(),
    duration: integer("duration").notNull(),
    location: text("location").notNull(),
    url: text("url").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("cohort_sessions_class_time").on(t.classId, t.startsAt)],
);

export const classAssignments = sqliteTable(
  "class_assignments",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    dueAt: text("due_at"),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("assignments_class").on(t.classId, t.createdAt)],
);
export const projectSubmissions = sqliteTable(
  "project_submissions",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id").notNull(),
    studentId: text("student_id").notNull(),
    attempt: integer("attempt").notNull(),
    assignmentVersion: integer("assignment_version").notNull(),
    instructions: text("instructions").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    submittedAt: text("submitted_at").notNull(),
    late: integer("late").notNull().default(0),
    status: text("status").notNull().default("submitted"),
    feedback: text("feedback").notNull().default(""),
    score: integer("score"),
    reviewerName: text("reviewer_name"),
    reviewedAt: text("reviewed_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("submissions_assignment_student").on(
      t.assignmentId,
      t.studentId,
      t.attempt,
    ),
  ],
);
