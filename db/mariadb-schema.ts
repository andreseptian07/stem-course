// Node/MariaDB schema. The existing D1 schema remains in schema.ts.
import { mysqlTable, varchar, longtext, int, bigint, primaryKey, index, uniqueIndex } from "drizzle-orm/mysql-core";
export const certificates = mysqlTable("certificates", {
  number: varchar("number", {length:48}).primaryKey(),
  userId: varchar("user_id", {length:191}).notNull(),
  courseId: varchar("course_id", {length:191}).notNull(),
  classId: varchar("class_id", {length:191}).notNull(),
  courseVersion: int("course_version").notNull(),
  recipientName: longtext("recipient_name").notNull(),
  courseTitle: longtext("course_title").notNull(),
  className: longtext("class_name").notNull(),
  evidence: longtext("evidence").notNull(),
  issuedAt: varchar("issued_at", {length:32}).notNull(),
  revokedAt: varchar("revoked_at", {length:32}),
  revokedBy: varchar("revoked_by", {length:191}),
  revokeReason: longtext("revoke_reason"),
}, t => [uniqueIndex("certificates_learner_class").on(t.userId,t.courseId,t.classId), index("certificates_course_time").on(t.courseId,t.issuedAt)]);
export const notificationReads = mysqlTable("notification_reads", {
  userId: varchar("user_id", { length: 191 }).notNull(),
  eventId: varchar("event_id", { length: 64 }).notNull(),
  readAt: varchar("read_at", { length: 32 }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.eventId] })]);
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
    authorizationId: varchar("authorization_id", { length: 48 }).notNull().default(""),
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
  mentorGrantVersion: int("mentor_grant_version").notNull().default(1),
  assignmentProof: varchar("assignment_proof",{length:80}).notNull().default(""),
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
    authorizationVersion: int("authorization_version").notNull().default(1),
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
    assessmentRevision: int("assessment_revision").notNull().default(1),
    contentRevision: int("content_revision").notNull().default(1),
    rubric: longtext("rubric").notNull().default(""),
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
    assessmentRevision: int("assessment_revision").notNull().default(0),
    lessonRevision: int("lesson_revision").notNull().default(0),
    requirementRevision: int("requirement_revision").notNull().default(0),
    snapshot: longtext("snapshot").notNull().default("{}"),
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
    uniqueIndex("academic_submission_attempt").on(t.assignmentId,t.studentId,t.attempt),
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

export const authCredentials = mysqlTable("auth_credentials", {
  userId: varchar("user_id", { length: 191 }).primaryKey(),
  email: varchar("email", { length: 254 }).notNull(),
  displayName: longtext("display_name").notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  passwordVersion: int("password_version").notNull().default(1),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
}, (t) => [uniqueIndex("auth_credentials_email_unique").on(t.email)]);
export const authSessions = mysqlTable("auth_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 191 }).notNull(),
  passwordVersion: int("password_version").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastSeen: bigint("last_seen", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
}, (t) => [index("auth_sessions_user_idx").on(t.userId), index("auth_sessions_expiry_idx").on(t.expiresAt)]);
export const authLimits = mysqlTable("auth_limits", {
  bucketId: varchar("bucket_id", { length: 64 }).primaryKey(),
  hits: int("hits").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
}, (t) => [index("auth_limits_expiry_idx").on(t.expiresAt)]);

export const tutorAccounts = mysqlTable("tutor_accounts", {
  userId: varchar("user_id", { length: 191 }).primaryKey(),
  active: int("active").notNull().default(1),
  grantedBy: varchar("granted_by", { length: 191 }).notNull(),
  grantedAt: varchar("granted_at", { length: 32 }).notNull(),
  revokedAt: varchar("revoked_at", { length: 32 }),
});
export const tutorInvitations = mysqlTable("tutor_invitations", {
  id: varchar("id", { length: 191 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  displayName: longtext("display_name").notNull(),
  classId: varchar("class_id", { length: 191 }),
  capability: varchar("capability", {length:32}).notNull().default("tutor"), courseId: varchar("course_id", {length:191}),
  createdBy: varchar("created_by", { length: 191 }).notNull(),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  acceptedUserId: varchar("accepted_user_id", { length: 191 }),
  acceptedAt: varchar("accepted_at", { length: 32 }),
  activationId: varchar("activation_id", { length: 191 }),
  revokedAt: varchar("revoked_at", { length: 32 }),
}, (t) => [uniqueIndex("tutor_invitation_token_unique").on(t.tokenHash), index("tutor_invitation_email_idx").on(t.email)]);
export const tutorEvents = mysqlTable("tutor_events", {
  id: varchar("id", { length: 191 }).primaryKey(),
  actorId: varchar("actor_id", { length: 191 }).notNull(),
  targetEmail: varchar("target_email", { length: 254 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  reason: longtext("reason").notNull(),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
}, (t) => [index("tutor_events_time_idx").on(t.createdAt)]);

export const authEmailStatus = mysqlTable("auth_email_status", {
  userId: varchar("user_id", { length: 191 }).primaryKey(),
  email: varchar("email", { length: 254 }).notNull(),
  verifiedAt: varchar("verified_at", { length: 32 }).notNull(),
});
export const authEmailTokens = mysqlTable("auth_email_tokens", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 191 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  purpose: varchar("purpose", { length: 16 }).notNull(),
  passwordVersion: int("password_version").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  usedAt: bigint("used_at", { mode: "number" }),
  claimId: varchar("claim_id", { length: 36 }),
}, (t) => [index("auth_email_tokens_user_idx").on(t.userId), index("auth_email_tokens_expiry_idx").on(t.expiresAt)]);

export const projectFiles = mysqlTable("project_files", {
  id: varchar("id", {length: 36}).primaryKey(),
  ownerId: varchar("owner_id", {length: 191}).notNull(),
  assignmentId: varchar("assignment_id", {length: 191}).notNull(),
  submissionId: varchar("submission_id", {length: 191}),
  scope: varchar("scope", {length: 64}).notNull(),
  name: varchar("name", {length: 180}).notNull(),
  mime: varchar("mime", {length: 80}).notNull(),
  size: int("size").notNull(),
  ready: int("ready").notNull().default(0),
  createdAt: varchar("created_at", {length: 32}).notNull(),
}, (t) => [index("project_files_owner").on(t.ownerId, t.assignmentId), index("project_files_submission").on(t.submissionId)]);

export const mediaFiles = mysqlTable("media_files", {
  id: varchar("id", {length:36}).primaryKey(),
  ownerId: varchar("owner_id", {length:191}).notNull(),
  courseId: varchar("course_id", {length:191}),
  purpose: varchar("purpose", {length:16}).notNull(),
  scope: varchar("scope", {length:64}).notNull(),
  name: varchar("name", {length:180}).notNull(),
  mime: varchar("mime", {length:80}).notNull(),
  size: int("size").notNull(),
  ready: int("ready").notNull().default(0),
  bound: int("bound").notNull().default(0),
  createdAt: varchar("created_at", {length:32}).notNull(),
}, (t) => [index("media_owner_scope").on(t.ownerId,t.scope), index("media_course").on(t.courseId)]);

export const curriculumMembers = mysqlTable("curriculum_members", {
  courseId: varchar("course_id", {length:191}).notNull(), userId: varchar("user_id", {length:191}).notNull(),
  proof: varchar("proof", {length:191}).notNull(),
  grantVersion: int("grant_version").notNull().default(1),
  active: int("active").notNull(), version: int("version").notNull(),
  grantedBy: varchar("granted_by", {length:191}).notNull(), updatedAt: varchar("updated_at", {length:191}).notNull(),
}, t => [primaryKey({columns:[t.courseId,t.userId]})]);
export const curriculumDrafts = mysqlTable("curriculum_drafts", {
  courseId: varchar("course_id", {length:191}).primaryKey(), data: longtext("data").notNull(),
  baseVersion: int("base_version").notNull(), version: int("version").notNull(),
  state: varchar("state", {length:191}).notNull(), updatedBy: varchar("updated_by", {length:191}).notNull(),
  updatedAt: varchar("updated_at", {length:191}).notNull(), note: longtext("note").notNull(), proof: varchar("proof", {length:191}).notNull(),
});
export const curriculumEvents = mysqlTable("curriculum_events", {
  id: varchar("id", {length:191}).primaryKey(), courseId: varchar("course_id", {length:191}).notNull(),
  actorId: varchar("actor_id", {length:191}).notNull(), kind: varchar("kind", {length:191}).notNull(),
  detail: longtext("detail").notNull(), createdAt: varchar("created_at", {length:191}).notNull(),
}, t => [index("curriculum_events_course_time").on(t.courseId,t.createdAt)]);

// Durable account category and independent staff capabilities. users.role is display-only.
export const accountPrincipals = mysqlTable("account_principals", {
  userId: varchar("user_id", { length: 191 }).primaryKey().references(() => users.id),
  kind: varchar("kind", { length: 32 }).notNull(),
  version: int("version").notNull().default(1),
  updatedBy: varchar("updated_by", { length: 191 }).notNull(),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
  proof: varchar("proof", { length: 80 }).notNull(),
});
export const staffGrants = mysqlTable("staff_grants", {
  userId: varchar("user_id", { length: 191 }).notNull().references(() => users.id),
  capability: varchar("capability", { length: 32 }).notNull(),
  active: int("active").notNull().default(0),
  version: int("version").notNull().default(1),
  grantedBy: varchar("granted_by", { length: 191 }).notNull(),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
  proof: varchar("proof", { length: 80 }).notNull(),
}, t => [primaryKey({columns:[t.userId,t.capability]}), index("staff_grants_capability_idx").on(t.capability,t.active,t.userId)]);
export const authorizationEvents = mysqlTable("authorization_events", {
  id: varchar("id", { length: 80 }).primaryKey(),
  actorId: varchar("actor_id", { length: 191 }).notNull(),
  targetId: varchar("target_id", { length: 191 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  capability: varchar("capability", { length: 32 }),
  scopeId: varchar("scope_id", { length: 191 }),
  reason: longtext("reason").notNull(),
  data: longtext("data").notNull(),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
}, t => [index("authorization_events_target_idx").on(t.targetId,t.createdAt)]);

export const learningProgressRevisions = mysqlTable("learning_progress_revisions", {
  userId: varchar("user_id", {length:191}).notNull(),
  courseId: varchar("course_id", {length:191}).notNull(),
  lessonId: varchar("lesson_id", {length:191}).notNull(),
  revision: int("revision").notNull(),
  complete: int("complete").notNull().default(0),
  quizPassed: int("quiz_passed").notNull().default(0),
  codePassed: int("code_passed").notNull().default(0),
  quizAttempts: int("quiz_attempts").notNull().default(0),
  codeAttempts: int("code_attempts").notNull().default(0),
  score: int("score").notNull().default(0),
  version: int("version").notNull().default(1),
  quizEvidenceId: varchar("quiz_evidence_id", {length:191}),
  codeEvidenceId: varchar("code_evidence_id", {length:191}),
  provenance: varchar("provenance", {length:80}).notNull().default("native"),
}, t => [primaryKey({name:"academic_progress_pk",columns:[t.userId,t.courseId,t.lessonId,t.revision]}),]);

export const classAssignmentRequirements = mysqlTable("class_assignment_requirements", {
  classId: varchar("class_id", {length:191}).notNull(),
  requirementId: varchar("requirement_id", {length:191}).notNull(),
  courseId: varchar("course_id", {length:191}).notNull(),
  lessonId: varchar("lesson_id", {length:191}).notNull(),
  assignmentId: varchar("assignment_id", {length:191}).notNull(),
  requirementRevision: int("requirement_revision").notNull(),
  version: int("version").notNull().default(1),
}, t => [primaryKey({columns:[t.classId,t.requirementId]}),uniqueIndex("academic_binding_assignment").on(t.assignmentId)]);

export const assignmentRevisions = mysqlTable("assignment_revisions", {
  assignmentId: varchar("assignment_id", {length:191}).notNull(),
  version: int("version").notNull(),
  assessmentRevision: int("assessment_revision").notNull(),
  contentRevision: int("content_revision").notNull(),
  data: longtext("data").notNull(),
  actorId: varchar("actor_id", {length:191}).notNull(),
  createdAt: varchar("created_at", {length:80}).notNull(),
}, t => [primaryKey({columns:[t.assignmentId,t.version]}),]);

export const projectReviews = mysqlTable("project_reviews", {
  id: varchar("id", {length:191}).notNull(),
  submissionId: varchar("submission_id", {length:191}).notNull(),
  sequence: int("sequence").notNull(),
  reviewerId: varchar("reviewer_id", {length:191}).notNull(),
  reviewerName: longtext("reviewer_name").notNull(),
  status: varchar("status", {length:80}).notNull(),
  score: int("score"),
  feedback: longtext("feedback").notNull(),
  snapshot: longtext("snapshot").notNull(),
  requestId: varchar("request_id", {length:191}).notNull(),
  createdAt: varchar("created_at", {length:80}).notNull(),
}, t => [primaryKey({columns:[t.id]}),uniqueIndex("academic_review_sequence").on(t.submissionId,t.sequence),uniqueIndex("academic_review_request").on(t.reviewerId,t.requestId)]);

export const academicChangeEvents = mysqlTable("academic_change_events", {
  id: varchar("id", {length:191}).notNull(),
  actorId: varchar("actor_id", {length:191}).notNull(),
  objectId: varchar("object_id", {length:191}).notNull(),
  kind: varchar("kind", {length:80}).notNull(),
  data: longtext("data").notNull(),
  createdAt: varchar("created_at", {length:80}).notNull(),
}, t => [primaryKey({columns:[t.id]}),]);

export const academicMutationReceipts = mysqlTable("academic_mutation_receipts", {
  actorId: varchar("actor_id", {length:191}).notNull(),
  action: varchar("action", {length:80}).notNull(),
  requestId: varchar("request_id", {length:191}).notNull(),
  digest: varchar("digest", {length:80}).notNull(),
  result: longtext("result").notNull(),
  createdAt: varchar("created_at", {length:80}).notNull(),
}, t => [primaryKey({columns:[t.actorId,t.action,t.requestId]}),]);
