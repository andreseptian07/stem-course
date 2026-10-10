import type { Course } from "./model.ts";
export const DEFAULT_REVIEW_PASS_THRESHOLD = 80;
// Missing values retain the established default; invalid stored values fail closed.
export function courseReviewThreshold(course: Pick<Course, "reviewPassThreshold">): number {
  const value = course.reviewPassThreshold === undefined ? DEFAULT_REVIEW_PASS_THRESHOLD : course.reviewPassThreshold;
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : NaN;
}
