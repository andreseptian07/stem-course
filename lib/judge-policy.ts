import type {Course} from "./model";
export function hasRequiredCoding(course:Pick<Course,"lessons">|undefined) {
  return !!course?.lessons.some(lesson=>lesson.exercise?.required);
}
export const REQUIRED_CODING_WARNING="Course ini memiliki tes coding wajib. Penilaian resmi belum siap; peserta tidak bisa meluluskan tes coding atau melanjutkan tahap yang mensyaratkannya. Simpan sebagai draf atau hubungkan pemeriksa kode sebelum membuka course untuk peserta.";
