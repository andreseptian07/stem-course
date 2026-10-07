import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const certificates = sqliteTable("certificates", {
  number: text("number").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull(),
  classId: text("class_id").notNull(),
  courseVersion: integer("course_version").notNull(),
  recipientName: text("recipient_name").notNull(),
  courseTitle: text("course_title").notNull(),
  className: text("class_name").notNull(),
  evidence: text("evidence").notNull(),
  issuedAt: text("issued_at").notNull(),
  revokedAt: text("revoked_at"),
  revokedBy: text("revoked_by"),
  revokeReason: text("revoke_reason"),
}, t => [uniqueIndex("certificates_learner_class").on(t.userId,t.courseId,t.classId), index("certificates_course_time").on(t.courseId,t.issuedAt)]);
export const notificationReads = sqliteTable("notification_reads", {
  userId: text("user_id").notNull(),
  eventId: text("event_id").notNull(),
  readAt: text("read_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.eventId] })]);
export const tutorAccounts = sqliteTable("tutor_accounts", {
  userId: text("user_id").primaryKey(), active: integer("active").notNull().default(1),
  grantedBy: text("granted_by").notNull(), grantedAt: text("granted_at").notNull(), revokedAt: text("revoked_at"),
});
export const tutorInvitations = sqliteTable("tutor_invitations", {
  id: text("id").primaryKey(), tokenHash: text("token_hash").notNull().unique(), email: text("email").notNull(),
  displayName: text("display_name").notNull(), classId: text("class_id"), createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(), expiresAt: integer("expires_at").notNull(), acceptedUserId: text("accepted_user_id"),
  acceptedAt: text("accepted_at"), activationId: text("activation_id"), revokedAt: text("revoked_at"),
}, (t) => [index("tutor_invitation_email_idx").on(t.email)]);
export const tutorEvents = sqliteTable("tutor_events", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(), targetEmail: text("target_email").notNull(),
  kind: text("kind").notNull(), reason: text("reason").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("tutor_events_time_idx").on(t.createdAt)]);
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

export const userAccess = sqliteTable("user_access", {
  userId: text("user_id").primaryKey(),
  status: text("status").notNull().default("pending"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const accessEvents = sqliteTable(
  "access_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    targetId: text("target_id").notNull(),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("access_events_time").on(t.createdAt)],
);

export const projectFiles = sqliteTable("project_files", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  assignmentId: text("assignment_id").notNull(),
  submissionId: text("submission_id"),
  scope: text("scope").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  ready: integer("ready").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => [index("project_files_owner").on(t.ownerId, t.assignmentId), index("project_files_submission").on(t.submissionId)]);

export const mediaFiles = sqliteTable("media_files", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: text("course_id"),
  purpose: text("purpose").notNull(),
  scope: text("scope").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  ready: integer("ready").notNull().default(0),
  bound: integer("bound").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => [index("media_owner_scope").on(t.ownerId,t.scope), index("media_course").on(t.courseId)]);
