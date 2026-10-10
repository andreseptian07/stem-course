export type Block = {
  id: string;
  type: "text" | "heading" | "callout" | "video" | "image" | "file" | "code" | "diagram";
  content: string;
  caption?: string;
};
export type Question = {
  id: string;
  prompt: string;
  options: string[];
  correct: number[];
  explanation: string;
};
export type Quiz = {
  mode: "review" | "required";
  threshold: number;
  maxAttempts: number;
  feedback: "always" | "after_pass" | "never";
  questions: Question[];
};
export type Exercise = {
  language: "python" | "javascript" | "cpp";
  prompt: string;
  starter: string;
  required: boolean;
  maxAttempts: number;
  tests: { input: string; expected: string; hidden: boolean }[];
};
export type Lesson = {
  id: string;
  revision: number;
  contentRevision?: number;
  reviewRequirements?: ReviewRequirement[];
  change?: { kind: "editorial" | "substantial"; reason: string };
  module: string;
  title: string;
  minutes: number;
  blocks: Block[];
  quiz?: Quiz;
  exercise?: Exercise;
};
export type Course = {
  id: string;
  version: number;
  title: string;
  description: string;
  category: string;
  level: string;
  published: boolean;
  sample: boolean;
  certificateEnabled?: boolean;
  graduationPolicyVersion?: 2;
  reviewPassThreshold?: number;
  retiredLessonIds?:string[];
  retiredRequirementIds?:string[];
  learningMode?: "class_required" | "independent_allowed";
  policyState?: "needs_mapping" | "ready";
  overview?: {
    outcomes: string[];
    requirements: string[];
    audience: string;
    mentorName: string;
    mentorBio: string;
    format: "self_paced" | "blended";
  };
  lessons: Lesson[];
};
export type Progress = {
  lessonId: string;
  revision: number;
  complete: number;
  quizPassed: number;
  codePassed: number;
  quizAttempts: number;
  codeAttempts: number;
  score: number;
  version?: number;
  quizEvidenceId?: string | null;
  codeEvidenceId?: string | null;
  provenance?: string;
};
export type ReviewRequirement = { id: string; title: string; instructions: string; rubric: string; revision: number };
export type GraduationBlocker = { code: string; message: string; lessonId?: string; assignmentId?: string };
export type GraduationLesson = {
  lessonId: string; unlocked: boolean; stagePassed: boolean;
  platform: { complete: boolean; quizPassed: boolean; codePassed: boolean };
  requiredReviews: { id: string; title: string; assignmentId: string | null; status: string; score: number | null; minimumScore: number; passed: boolean }[];
  blockers: GraduationBlocker[];
};
export type GraduationState = {
  classId: string | null; className: string | null;
  classes: { id: string; name: string }[];
  problem: GraduationBlocker | null; lessons: GraduationLesson[]; passed: boolean;
};
export type PublicLesson = Omit<Lesson, "quiz" | "exercise"> & {
  locked: boolean;
  blocker?: string;
  graduation?: GraduationLesson;
  quiz?: Omit<Quiz, "questions"> & {
    questions: Omit<Question, "correct" | "explanation">[];
  };
  exercise?: Omit<Exercise, "tests"> & {
    tests: { input: string; expected: string; hidden: boolean }[];
    hiddenCount: number;
  };
};
export type PublicCourse = Omit<Course, "lessons"> & {
  lessons: PublicLesson[];
  graduation?: GraduationState;
};
export type Session = {
  id: string;
  courseId: string;
  title: string;
  kind: "online" | "offline";
  startsAt: string;
  duration: number;
  location: string;
  url: string;
  capacity: number;
  count: number;
  joined: boolean;
};
export type Discussion = {
  id: string;
  courseId: string;
  lessonId: string;
  userId: string;
  name: string;
  role: string;
  body: string;
  parentId: string | null;
  createdAt: string;
};
export type State = {
  curriculum?: boolean;
  user: { id: string; name: string; role: string };
  courses: PublicCourse[];
  progress: Record<string, Progress[]>;
  sessions: Session[];
  classSessions?: {
    id: string; classId: string; className: string; courseId: string; courseTitle: string;
    title: string; kind: "online" | "offline"; startsAt: string; duration: number; location: string; url: string;
  }[];
  judgeReady: boolean;
};
