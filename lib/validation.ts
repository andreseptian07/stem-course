import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const courseSchema = z
  .object({
    id,
    version: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(160),
    description: z.string().max(2000),
    category: z.string().max(80),
    level: z.string().max(40),
    published: z.boolean(),
    sample: z.boolean(),
    overview: z
      .object({
        outcomes: z.array(z.string().trim().min(1).max(500)).max(20),
        requirements: z.array(z.string().trim().min(1).max(500)).max(20),
        audience: z.string().max(1000),
        mentorName: z.string().max(160),
        mentorBio: z.string().max(2000),
        format: z.enum(["self_paced", "blended"]),
      })
      .optional(),
    lessons: z
      .array(
        z.object({
          id,
          revision: z.number().int().positive(),
          module: z.string().trim().min(1).max(100),
          title: z.string().trim().min(1).max(160),
          minutes: z.number().int().min(1).max(600),
          blocks: z
            .array(
              z.object({
                id,
                type: z.enum([
                  "text",
                  "heading",
                  "callout",
                  "video",
                  "image",
                  "code",
                  "diagram",
                ]),
                content: z.string().max(20000),
                caption: z.string().max(300).optional(),
              }),
            )
            .max(50),
          quiz: z
            .object({
              mode: z.enum(["review", "required"]),
              threshold: z.number().int().min(1).max(100),
              maxAttempts: z.number().int().min(0).max(100),
              feedback: z.enum(["always", "after_pass", "never"]),
              questions: z
                .array(
                  z.object({
                    id,
                    prompt: z.string().trim().min(1).max(3000),
                    options: z
                      .array(z.string().trim().min(1).max(1000))
                      .min(2)
                      .max(8),
                    correct: z.array(z.number().int().min(0)).min(1).max(8),
                    explanation: z.string().max(3000),
                  }),
                )
                .min(1)
                .max(30),
            })
            .optional(),
          exercise: z
            .object({
              language: z.enum(["python", "javascript", "cpp"]),
              prompt: z.string().max(5000),
              starter: z.string().max(20000),
              required: z.boolean(),
              maxAttempts: z.number().int().min(0).max(100),
              tests: z
                .array(
                  z.object({
                    input: z.string().max(5000),
                    expected: z.string().max(5000),
                    hidden: z.boolean(),
                  }),
                )
                .min(1)
                .max(8),
            })
            .optional(),
        }),
      )
      .max(100),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.lessons.map((l) => l.id)).size !== c.lessons.length)
      ctx.addIssue({ code: "custom", message: "ID materi harus unik." });
    if (c.published && !c.lessons.length)
      ctx.addIssue({
        code: "custom",
        message: "Tambahkan materi sebelum menerbitkan course.",
      });
    for (const l of c.lessons) {
      if (new Set(l.blocks.map((b) => b.id)).size !== l.blocks.length)
        ctx.addIssue({ code: "custom", message: "ID blok harus unik." });
      if (l.quiz) {
        if (
          new Set(l.quiz.questions.map((q) => q.id)).size !==
          l.quiz.questions.length
        )
          ctx.addIssue({ code: "custom", message: "ID soal harus unik." });
        for (const q of l.quiz.questions)
          if (
            new Set(q.correct).size !== q.correct.length ||
            q.correct.some((n) => n >= q.options.length)
          )
            ctx.addIssue({
              code: "custom",
              message: "Kunci jawaban tidak valid.",
            });
      }
      for (const b of l.blocks)
        if (["video", "image"].includes(b.type) && b.content) {
          try {
            if (new URL(b.content).protocol !== "https:") throw 0;
          } catch {
            ctx.addIssue({
              code: "custom",
              message: "Gunakan URL HTTPS yang valid untuk media.",
            });
          }
        }
    }
  });
export const sessionSchema = z
  .object({
    id: id.optional(),
    courseId: id,
    title: z.string().trim().min(1).max(160),
    kind: z.enum(["online", "offline"]),
    startsAt: z.string().datetime(),
    duration: z.number().int().min(15).max(480),
    location: z.string().max(500),
    url: z.string().max(2000),
    capacity: z.number().int().min(1).max(500),
  })
  .superRefine((s, c) => {
    if (s.kind === "online") {
      try {
        if (new URL(s.url).protocol !== "https:") throw 0;
      } catch {
        c.addIssue({
          code: "custom",
          message: "Tautan meeting harus menggunakan HTTPS.",
        });
      }
    }
    if (s.kind === "offline" && !s.location.trim())
      c.addIssue({ code: "custom", message: "Lokasi tatap muka wajib diisi." });
  });
