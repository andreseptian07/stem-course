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
};
export type PublicLesson = Omit<Lesson, "quiz" | "exercise"> & {
  locked: boolean;
  blocker?: string;
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
  user: { id: string; name: string; role: string };
  courses: PublicCourse[];
  progress: Record<string, Progress[]>;
  sessions: Session[];
  judgeReady: boolean;
};
