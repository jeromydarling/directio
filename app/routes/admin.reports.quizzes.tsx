import { Link, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.reports.quizzes";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, Card, EmptyState, LinkButton } from "~/components/ui";

type LessonSummary = {
  schoolLessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  attemptCount: number;
  uniqueStudents: number;
  passRate: number;
  avgScore: number;
};

type WeakQuestion = {
  questionId: string;
  prompt: string;
  schoolLessonId: string;
  lessonTitle: string;
  attempts: number;
  wrong: number;
  wrongRate: number;
};

type StudentRow = {
  userId: string;
  studentFirst: string | null;
  studentLast: string | null;
  email: string | null;
  attempts: number;
  passed: number;
  avgScore: number;
};

type LessonDetailRow = {
  questionId: string;
  prompt: string;
  choices: string;
  correctIndex: number;
  attempts: number;
  wrong: number;
  wrongRate: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const lessonId = url.searchParams.get("lesson");

  // Aggregated stats per lesson.
  const lessonsRows = await db
    .prepare(
      `SELECT sl.id AS schoolLessonId, sl.title AS lessonTitle, sm.title AS moduleTitle,
              COUNT(qa.id) AS attemptCount,
              COUNT(DISTINCT qa.userId) AS uniqueStudents,
              COALESCE(AVG(qa.scorePercent), 0) AS avgScore,
              COALESCE(AVG(qa.passed) * 100, 0) AS passRate
         FROM school_lesson sl
         JOIN school_module sm ON sm.id = sl.schoolModuleId
         LEFT JOIN quiz_attempt qa ON qa.schoolLessonId = sl.id AND qa.organizationId = ?
         WHERE sl.organizationId = ? AND sl.published = 1
         GROUP BY sl.id, sl.title, sm.title
         HAVING attemptCount > 0
         ORDER BY passRate ASC, attemptCount DESC
         LIMIT 50`,
    )
    .bind(tenant.organization.id, tenant.organization.id)
    .all<LessonSummary>();

  // Weakest 10 quiz questions org-wide (highest wrong-rate, min 3 attempts).
  const weakestRows = await db
    .prepare(
      `SELECT qaa.schoolQuestionId AS questionId,
              sqq.prompt,
              sl.id AS schoolLessonId,
              sl.title AS lessonTitle,
              COUNT(*) AS attempts,
              SUM(CASE WHEN qaa.isCorrect = 0 THEN 1 ELSE 0 END) AS wrong,
              ROUND(100.0 * SUM(CASE WHEN qaa.isCorrect = 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS wrongRate
         FROM quiz_attempt_answer qaa
         JOIN quiz_attempt qa ON qa.id = qaa.quizAttemptId
         JOIN school_quiz_question sqq ON sqq.id = qaa.schoolQuestionId
         JOIN school_lesson sl ON sl.id = qa.schoolLessonId
         WHERE qa.organizationId = ?
         GROUP BY qaa.schoolQuestionId, sqq.prompt, sl.id, sl.title
         HAVING attempts >= 3
         ORDER BY wrongRate DESC, attempts DESC
         LIMIT 10`,
    )
    .bind(tenant.organization.id)
    .all<WeakQuestion>();

  // Top struggling students org-wide (lowest avg score, min 2 attempts).
  const strugglingRows = await db
    .prepare(
      `SELECT qa.userId,
              u.email,
              (SELECT s.firstName FROM student s WHERE s.userId = qa.userId AND s.organizationId = qa.organizationId LIMIT 1) AS studentFirst,
              (SELECT s.lastName FROM student s WHERE s.userId = qa.userId AND s.organizationId = qa.organizationId LIMIT 1) AS studentLast,
              COUNT(qa.id) AS attempts,
              SUM(qa.passed) AS passed,
              ROUND(AVG(qa.scorePercent), 1) AS avgScore
         FROM quiz_attempt qa
         JOIN user u ON u.id = qa.userId
         WHERE qa.organizationId = ?
         GROUP BY qa.userId, u.email
         HAVING attempts >= 2
         ORDER BY avgScore ASC, attempts DESC
         LIMIT 20`,
    )
    .bind(tenant.organization.id)
    .all<StudentRow>();

  // Headline counts.
  const headline = await db
    .prepare(
      `SELECT COUNT(*) AS totalAttempts,
              COUNT(DISTINCT userId) AS uniqueStudents,
              COALESCE(AVG(scorePercent), 0) AS avgScore,
              COALESCE(AVG(passed) * 100, 0) AS passRate
         FROM quiz_attempt WHERE organizationId = ?`,
    )
    .bind(tenant.organization.id)
    .first<{ totalAttempts: number; uniqueStudents: number; avgScore: number; passRate: number }>();

  // Optional drill-in for one lesson.
  let lessonDetail: {
    lesson: { id: string; title: string; moduleTitle: string };
    questions: LessonDetailRow[];
  } | null = null;
  if (lessonId) {
    const lesson = await db
      .prepare(
        `SELECT sl.id, sl.title, sm.title AS moduleTitle
           FROM school_lesson sl
           JOIN school_module sm ON sm.id = sl.schoolModuleId
           WHERE sl.id = ? AND sl.organizationId = ?`,
      )
      .bind(lessonId, tenant.organization.id)
      .first<{ id: string; title: string; moduleTitle: string }>();
    if (lesson) {
      const rows = await db
        .prepare(
          `SELECT sqq.id AS questionId, sqq.prompt, sqq.choices, sqq.correctIndex,
                  COUNT(qaa.id) AS attempts,
                  SUM(CASE WHEN qaa.isCorrect = 0 THEN 1 ELSE 0 END) AS wrong,
                  CASE WHEN COUNT(qaa.id) = 0 THEN 0
                       ELSE ROUND(100.0 * SUM(CASE WHEN qaa.isCorrect = 0 THEN 1 ELSE 0 END) / COUNT(qaa.id), 1)
                  END AS wrongRate
             FROM school_quiz_question sqq
             JOIN school_quiz sq ON sq.id = sqq.schoolQuizId
             LEFT JOIN quiz_attempt_answer qaa ON qaa.schoolQuestionId = sqq.id
             LEFT JOIN quiz_attempt qa ON qa.id = qaa.quizAttemptId AND qa.schoolLessonId = ?
             WHERE sq.schoolLessonId = ?
             GROUP BY sqq.id, sqq.prompt, sqq.choices, sqq.correctIndex
             ORDER BY wrongRate DESC, sqq.ordinal`,
        )
        .bind(lessonId, lessonId)
        .all<LessonDetailRow>();
      lessonDetail = { lesson, questions: rows.results };
    }
  }

  return {
    headline: headline ?? { totalAttempts: 0, uniqueStudents: 0, avgScore: 0, passRate: 0 },
    lessons: lessonsRows.results,
    weakest: weakestRows.results,
    struggling: strugglingRows.results,
    lessonDetail,
  };
}

export default function QuizReports({ loaderData }: Route.ComponentProps) {
  const { headline, lessons, weakest, struggling, lessonDetail } = loaderData;
  const [params] = useSearchParams();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Reports"
        title="Quiz performance"
        description="Where students are getting tripped up, which lessons are working, and who needs a check-in."
        actions={
          <LinkButton to="/admin" variant="ghost">
            ← Dashboard
          </LinkButton>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Total attempts" value={headline.totalAttempts} highlight />
        <Stat label="Unique students" value={headline.uniqueStudents} />
        <Stat
          label="Avg score"
          value={`${Math.round(headline.avgScore)}%`}
        />
        <Stat
          label="Overall pass rate"
          value={`${Math.round(headline.passRate)}%`}
        />
      </section>

      {headline.totalAttempts === 0 ? (
        <EmptyState
          title="No quiz attempts yet"
          description="Once students take quizzes, this report fills in automatically. Every attempt and every answer is recorded."
        />
      ) : (
        <>
          {lessonDetail && (
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
                    {lessonDetail.lesson.moduleTitle}
                  </p>
                  <h2 className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                    {lessonDetail.lesson.title}
                  </h2>
                </div>
                <Link
                  to="/admin/reports/quizzes"
                  className="text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"
                >
                  Clear filter ×
                </Link>
              </div>
              <ul className="flex flex-col gap-2">
                {lessonDetail.questions.map((q, i) => {
                  const choices = JSON.parse(q.choices) as string[];
                  return (
                    <li
                      key={q.questionId}
                      className="rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                          Question {i + 1} · {q.attempts} attempt{q.attempts === 1 ? "" : "s"}
                        </p>
                        <p
                          className={[
                            "text-sm font-medium",
                            q.wrongRate >= 50
                              ? "text-red-600 dark:text-red-400"
                              : q.wrongRate >= 25
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400",
                          ].join(" ")}
                        >
                          {q.wrongRate}% wrong
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-ink-900 dark:text-ink-50">{q.prompt}</p>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                        Correct answer: <span className="font-medium">{choices[q.correctIndex]}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!lessonDetail && weakest.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Weakest questions
              </h2>
              <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">
                Highest wrong-rate across all your students (min 3 attempts). Likely candidates
                for clearer wording or a better explanation.
              </p>
              <ul className="flex flex-col gap-2">
                {weakest.map((q) => (
                  <li
                    key={q.questionId}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{q.prompt}</p>
                      <Link
                        to={`/admin/reports/quizzes?lesson=${q.schoolLessonId}`}
                        className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {q.lessonTitle} →
                      </Link>
                    </div>
                    <div className="text-right">
                      <p
                        className={[
                          "font-display text-2xl font-semibold",
                          q.wrongRate >= 75
                            ? "text-red-600 dark:text-red-400"
                            : q.wrongRate >= 50
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-ink-700 dark:text-ink-200",
                        ].join(" ")}
                      >
                        {q.wrongRate}%
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {q.wrong} / {q.attempts} wrong
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              By lesson
            </h2>
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Lesson</th>
                    <th className="px-4 py-3 font-medium text-right">Attempts</th>
                    <th className="px-4 py-3 font-medium text-right">Students</th>
                    <th className="px-4 py-3 font-medium text-right">Avg score</th>
                    <th className="px-4 py-3 font-medium text-right">Pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr
                      key={l.schoolLessonId}
                      className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/reports/quizzes?lesson=${l.schoolLessonId}`}
                          className="font-medium text-ink-900 hover:text-brand-600 dark:text-ink-50 dark:hover:text-brand-300"
                        >
                          {l.lessonTitle}
                        </Link>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{l.moduleTitle}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">
                        {l.attemptCount}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">
                        {l.uniqueStudents}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-900 dark:text-ink-50">
                        {Math.round(l.avgScore)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={[
                            "rounded-full px-3 py-1 text-xs font-medium",
                            l.passRate >= 80
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                              : l.passRate >= 60
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200"
                                : "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
                          ].join(" ")}
                        >
                          {Math.round(l.passRate)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {struggling.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Students who need a check-in
              </h2>
              <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">
                Lowest average scores across the org (min 2 attempts). Reach out before they
                lose momentum.
              </p>
              <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium text-right">Attempts</th>
                      <th className="px-4 py-3 font-medium text-right">Passed</th>
                      <th className="px-4 py-3 font-medium text-right">Avg score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {struggling.map((s) => (
                      <tr
                        key={s.userId}
                        className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-900 dark:text-ink-50">
                            {s.studentLast
                              ? `${s.studentLast}, ${s.studentFirst}`
                              : s.email ?? "—"}
                          </p>
                          {s.email && (
                            <p className="text-xs text-ink-500 dark:text-ink-400">{s.email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">
                          {s.attempts}
                        </td>
                        <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">
                          {s.passed}
                        </td>
                        <td className="px-4 py-3 text-right text-ink-900 dark:text-ink-50">
                          {Math.round(s.avgScore)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20" : ""
      }
    >
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
      </p>
    </Card>
  );
}
