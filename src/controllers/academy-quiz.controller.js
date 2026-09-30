const Assessment = require('../models/Assessment');
const Course = require('../models/Course');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAttempt = require('../models/QuizAttempt');
const Academy = require('../models/Academy');
const { getSettings: getEngagementSettings } = require('../services/engagement.service');
const { safeTimeZone, parseAcademyDateTime, formatAcademyInput, formatAcademyDisplay } = require('../services/timezone.service');
const {
  recalcQuizMarks,
  normalizeQuestionPayload,
  recomputeAttempt
} = require('../services/quiz.service');
const {
  manageableCourseIds: instructorCourseIds,
  assertCourse: assertInstructorCourse,
  assertDirectCourse: assertInstructorDirectCourse,
  studentCourseAccessFilter
} = require('../services/instructor-scope.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function manageableCourseIds(req) {
  if (req.user.role !== 'instructor') return null;
  return instructorCourseIds(req);
}

async function assertCourseAccess(req, courseId) {
  if (req.user.role === 'instructor') {
    return assertInstructorCourse(req, courseId);
  }

  const course = await Course.findOne({
    _id: courseId,
    academyId: req.academyId
  });

  if (!course) {
    const err = new Error('الدورة غير موجودة في هذه الأكاديمية');
    err.status = 404;
    throw err;
  }

  return course;
}

async function assertCourseManagementAccess(req, courseId) {
  if (req.user.role === 'instructor') {
    return assertInstructorDirectCourse(req, courseId);
  }

  return assertCourseAccess(req, courseId);
}

async function getQuizForAdmin(req, id) {
  const quiz = await Assessment.findOne({
    _id: id,
    academyId: req.academyId,
    type: 'quiz'
  }).populate('courseId', 'title code instructorId');

  if (!quiz) {
    const err = new Error('الاختبار غير موجود');
    err.status = 404;
    throw err;
  }

  if (req.user.role === 'instructor') {
    await assertInstructorCourse(req, quiz.courseId?._id || quiz.courseId);
  }

  return quiz;
}

async function ensureQuestionsEditable(quiz) {
  const attempts = await QuizAttempt.countDocuments({
    academyId: quiz.academyId,
    assessmentId: quiz._id
  });

  if (attempts > 0) {
    const err = new Error('لا يمكن تعديل الأسئلة بعد بدء الطلاب بالمحاولات');
    err.status = 409;
    throw err;
  }

  if (quiz.status !== 'draft') {
    const err = new Error('حوّل الاختبار إلى مسودة قبل تعديل الأسئلة');
    err.status = 409;
    throw err;
  }
}

async function listQuizzes(req, res) {
  const courseIds = await manageableCourseIds(req);
  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const query = {
    academyId: req.academyId,
    type: 'quiz'
  };

  if (courseIds) query.courseId = { $in: courseIds };

  const rows = await Assessment.find(query)
    .populate('courseId', 'title code instructorId')
    .sort({ createdAt: -1 });

  const canReviewAttempts = req.user.role !== 'content_manager';

  const result = await Promise.all(rows.map(async quiz => {
    const questionCount = await QuizQuestion.countDocuments({
      academyId: req.academyId,
      assessmentId: quiz._id
    });

    let attemptCount = null;
    let gradedCount = null;
    let pendingReviewCount = null;

    if (canReviewAttempts) {
      const attemptBase = req.user.role === 'instructor'
        ? await studentCourseAccessFilter(req, { assessmentId: quiz._id })
        : { academyId: req.academyId, assessmentId: quiz._id };

      [attemptCount, gradedCount, pendingReviewCount] = await Promise.all([
        QuizAttempt.countDocuments(attemptBase),
        QuizAttempt.countDocuments({ ...attemptBase, status: 'graded' }),
        QuizAttempt.countDocuments({ ...attemptBase, status: 'pending_review' })
      ]);
    }

    return {
      ...quiz.toObject(),
      availableFromLocal: formatAcademyInput(quiz.availableFrom, timezone),
      availableFromDisplay: formatAcademyDisplay(quiz.availableFrom, timezone),
      dueAtLocal: formatAcademyInput(quiz.dueAt, timezone),
      dueAtDisplay: formatAcademyDisplay(quiz.dueAt, timezone),
      timezone,
      questionCount,
      attemptCount,
      gradedCount,
      pendingReviewCount
    };
  }));

  res.json(result);
}

async function createQuiz(req, res) {
  const {
    courseId,
    title,
    description,
    availableFrom,
    dueAt,
    durationMinutes,
    maxAttempts,
    passingPercentage,
    shuffleQuestions,
    shuffleOptions,
    showCorrectAnswers,
    status
  } = req.body;

  if (!courseId || !clean(title)) {
    return res.status(400).json({ message: 'الدورة وعنوان الاختبار مطلوبان' });
  }

  await assertCourseManagementAccess(req, courseId);

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const normalizedAvailableFrom = availableFrom
    ? parseAcademyDateTime(availableFrom, timezone)
    : null;
  const normalizedDueAt = dueAt
    ? parseAcademyDateTime(dueAt, timezone)
    : null;

  const quiz = await Assessment.create({
    academyId: req.academyId,
    courseId,
    type: 'quiz',
    title: clean(title),
    description: clean(description),
    availableFrom: normalizedAvailableFrom,
    dueAt: normalizedDueAt,
    durationMinutes: Math.max(0, Number(durationMinutes || 0)),
    maxAttempts: Math.max(1, Number(maxAttempts || 1)),
    passingPercentage: Math.max(0, Math.min(100, Number(passingPercentage ?? 50))),
    shuffleQuestions: shuffleQuestions !== false,
    shuffleOptions: shuffleOptions !== false,
    showCorrectAnswers: Boolean(showCorrectAnswers),
    totalMarks: 1,
    status: 'draft'
  });

  res.status(201).json(quiz);
}

async function quizDetails(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);
  const canReviewAttempts = req.user.role !== 'content_manager';
  const attemptFilter = req.user.role === 'instructor'
    ? await studentCourseAccessFilter(req, { assessmentId: quiz._id })
    : { academyId: req.academyId, assessmentId: quiz._id };

  const [questions, attempts, hasAttempts] = await Promise.all([
    QuizQuestion.find({
      academyId: req.academyId,
      assessmentId: quiz._id
    })
      .select('+correctBoolean +explanation +options.isCorrect')
      .sort({ order: 1, createdAt: 1 }),
    canReviewAttempts
      ? QuizAttempt.find(attemptFilter)
          .populate('studentId', 'name email')
          .sort({ createdAt: -1 })
      : [],
    QuizAttempt.exists(
      req.user.role === 'content_manager'
        ? { academyId: req.academyId, assessmentId: quiz._id }
        : attemptFilter
    )
  ]);

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const quizView = {
    ...quiz.toObject(),
    availableFromLocal: formatAcademyInput(quiz.availableFrom, timezone),
    availableFromDisplay: formatAcademyDisplay(quiz.availableFrom, timezone),
    dueAtLocal: formatAcademyInput(quiz.dueAt, timezone),
    dueAtDisplay: formatAcademyDisplay(quiz.dueAt, timezone),
    timezone
  };

  res.json({
    quiz: quizView,
    questions,
    hasAttempts: Boolean(hasAttempts),
    attempts: attempts.map(row => ({
      id: row._id,
      student: row.studentId,
      attemptNumber: row.attemptNumber,
      status: row.status,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      score: row.score,
      totalMarks: row.totalMarks,
      percentage: row.percentage,
      passed: row.passed,
      requiresManualReview: row.requiresManualReview
    }))
  });
}

async function updateQuiz(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);
  await assertCourseManagementAccess(req, quiz.courseId?._id || quiz.courseId);
  const hasAttempts = await QuizAttempt.exists({
    academyId: req.academyId,
    assessmentId: quiz._id
  });

  if (req.body.courseId !== undefined) {
    if (hasAttempts && String(req.body.courseId) !== String(quiz.courseId?._id || quiz.courseId)) {
      return res.status(409).json({ message: 'لا يمكن تغيير الدورة بعد وجود محاولات' });
    }

    await assertCourseAccess(req, req.body.courseId);
    quiz.courseId = req.body.courseId;
  }

  const textFields = ['title','description'];
  for (const key of textFields) {
    if (req.body[key] !== undefined) quiz[key] = clean(req.body[key]);
  }

  if (req.body.availableFrom !== undefined || req.body.dueAt !== undefined) {
    const academy = await Academy.findById(req.academyId).select('timezone');
    const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');

    if (req.body.availableFrom !== undefined) {
      quiz.availableFrom = req.body.availableFrom
        ? parseAcademyDateTime(req.body.availableFrom, timezone)
        : null;
    }

    if (req.body.dueAt !== undefined) {
      quiz.dueAt = req.body.dueAt
        ? parseAcademyDateTime(req.body.dueAt, timezone)
        : null;
    }
  }

  if (req.body.durationMinutes !== undefined) {
    quiz.durationMinutes = Math.max(0, Number(req.body.durationMinutes || 0));
  }

  if (req.body.maxAttempts !== undefined) {
    quiz.maxAttempts = Math.max(1, Math.min(100, Number(req.body.maxAttempts || 1)));
  }

  if (req.body.passingPercentage !== undefined) {
    quiz.passingPercentage = Math.max(0, Math.min(100, Number(req.body.passingPercentage || 0)));
  }

  for (const key of ['shuffleQuestions','shuffleOptions','showCorrectAnswers']) {
    if (req.body[key] !== undefined) quiz[key] = Boolean(req.body[key]);
  }

  if (req.body.status !== undefined) {
    if (!['draft','published','closed'].includes(req.body.status)) {
      return res.status(400).json({ message: 'حالة الاختبار غير صحيحة' });
    }

    if (req.body.status === 'published') {
      const count = await QuizQuestion.countDocuments({
        academyId: req.academyId,
        assessmentId: quiz._id
      });

      if (!count) {
        return res.status(400).json({ message: 'أضف سؤالًا واحدًا على الأقل قبل نشر الاختبار' });
      }

      const engagementSettings = await getEngagementSettings(req.academyId);
      if (engagementSettings.gapMapEnabled) {
        const unmapped = await QuizQuestion.countDocuments({
          academyId: req.academyId,
          assessmentId: quiz._id,
          lessonId: null
        });

        if (unmapped) {
          return res.status(400).json({
            message: `اربط كل أسئلة الاختبار بالدروس قبل النشر. باقي ${unmapped} سؤال بدون درس.`
          });
        }
      }
    }

    quiz.status = req.body.status;
  }

  await quiz.save();

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  res.json({
    ...quiz.toObject(),
    availableFromLocal: formatAcademyInput(quiz.availableFrom, timezone),
    availableFromDisplay: formatAcademyDisplay(quiz.availableFrom, timezone),
    dueAtLocal: formatAcademyInput(quiz.dueAt, timezone),
    dueAtDisplay: formatAcademyDisplay(quiz.dueAt, timezone),
    timezone
  });
}

async function createQuestion(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);
  await assertCourseManagementAccess(req, quiz.courseId?._id || quiz.courseId);
  await ensureQuestionsEditable(quiz);

  const payload = normalizeQuestionPayload(req.body);

  const question = await QuizQuestion.create({
    academyId: req.academyId,
    assessmentId: quiz._id,
    courseId: quiz.courseId?._id || quiz.courseId,
    ...payload
  });

  const totalMarks = await recalcQuizMarks(req.academyId, quiz._id);

  res.status(201).json({
    question: await QuizQuestion.findById(question._id)
      .select('+correctBoolean +explanation +options.isCorrect'),
    totalMarks
  });
}

async function updateQuestion(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);
  await assertCourseManagementAccess(req, quiz.courseId?._id || quiz.courseId);
  await ensureQuestionsEditable(quiz);

  const question = await QuizQuestion.findOne({
    _id: req.params.questionId,
    academyId: req.academyId,
    assessmentId: quiz._id
  }).select('+correctBoolean +explanation +options.isCorrect');

  if (!question) {
    return res.status(404).json({ message: 'السؤال غير موجود' });
  }

  const payload = normalizeQuestionPayload(req.body);
  Object.assign(question, payload);
  await question.save();

  const totalMarks = await recalcQuizMarks(req.academyId, quiz._id);

  res.json({
    question,
    totalMarks
  });
}

async function deleteQuestion(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);
  await assertCourseManagementAccess(req, quiz.courseId?._id || quiz.courseId);
  await ensureQuestionsEditable(quiz);

  const row = await QuizQuestion.findOneAndDelete({
    _id: req.params.questionId,
    academyId: req.academyId,
    assessmentId: quiz._id
  });

  if (!row) {
    return res.status(404).json({ message: 'السؤال غير موجود' });
  }

  const totalMarks = await recalcQuizMarks(req.academyId, quiz._id);
  res.json({ ok: true, totalMarks });
}

async function listAttempts(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);

  const rows = await QuizAttempt.find(
    req.user.role === 'instructor'
      ? await studentCourseAccessFilter(req, { assessmentId: quiz._id })
      : { academyId: req.academyId, assessmentId: quiz._id }
  )
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 });

  res.json(rows.map(row => ({
    id: row._id,
    student: row.studentId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    score: row.score,
    totalMarks: row.totalMarks,
    percentage: row.percentage,
    passed: row.passed,
    requiresManualReview: row.requiresManualReview
  })));
}

async function attemptDetails(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);

  const attempt = await QuizAttempt.findOne(
    req.user.role === 'instructor'
      ? await studentCourseAccessFilter(req, {
          _id: req.params.attemptId,
          assessmentId: quiz._id
        })
      : {
          _id: req.params.attemptId,
          academyId: req.academyId,
          assessmentId: quiz._id
        }
  ).populate('studentId', 'name email');

  if (!attempt) {
    return res.status(404).json({ message: 'المحاولة غير موجودة' });
  }

  const questions = await QuizQuestion.find({
    academyId: req.academyId,
    assessmentId: quiz._id
  })
    .select('+correctBoolean +explanation +options.isCorrect')
    .sort({ order: 1 });

  const answerMap = new Map(
    attempt.answers.map(answer => [String(answer.questionId), answer])
  );

  res.json({
    attempt: {
      id: attempt._id,
      student: attempt.studentId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: attempt.percentage,
      passed: attempt.passed,
      requiresManualReview: attempt.requiresManualReview
    },
    questions: questions.map(question => ({
      id: question._id,
      type: question.type,
      prompt: question.prompt,
      marks: question.marks,
      options: question.options,
      correctBoolean: question.correctBoolean,
      explanation: question.explanation,
      answer: answerMap.get(String(question._id)) || null
    }))
  });
}

async function gradeShortAnswer(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);

  const [attempt, question] = await Promise.all([
    QuizAttempt.findOne(
      req.user.role === 'instructor'
        ? await studentCourseAccessFilter(req, {
            _id: req.params.attemptId,
            assessmentId: quiz._id
          })
        : {
            _id: req.params.attemptId,
            academyId: req.academyId,
            assessmentId: quiz._id
          }
    ),
    QuizQuestion.findOne({
      _id: req.params.questionId,
      academyId: req.academyId,
      assessmentId: quiz._id,
      type: 'short_answer'
    })
  ]);

  if (!attempt || !question) {
    return res.status(404).json({ message: 'المحاولة أو السؤال غير موجود' });
  }

  const answer = attempt.answers.find(
    item => String(item.questionId) === String(question._id)
  );

  if (!answer) {
    return res.status(404).json({ message: 'لا توجد إجابة لهذا السؤال' });
  }

  const awardedMarks = Number(req.body.awardedMarks);

  if (
    !Number.isFinite(awardedMarks) ||
    awardedMarks < 0 ||
    awardedMarks > Number(question.marks)
  ) {
    return res.status(400).json({
      message: `الدرجة يجب أن تكون بين 0 و ${question.marks}`
    });
  }

  answer.awardedMarks = awardedMarks;
  answer.isCorrect = awardedMarks === Number(question.marks);
  answer.needsManualReview = false;
  answer.feedback = clean(req.body.feedback) || '';

  recomputeAttempt(attempt, quiz);

  if (!attempt.answers.some(item => item.needsManualReview)) {
    attempt.status = 'graded';
    attempt.requiresManualReview = false;
    attempt.passed = attempt.percentage >= Number(quiz.passingPercentage ?? 50);
  }

  await attempt.save();

  res.json({
    id: attempt._id,
    status: attempt.status,
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    passed: attempt.passed,
    requiresManualReview: attempt.requiresManualReview
  });
}

module.exports = {
  listQuizzes,
  createQuiz,
  quizDetails,
  updateQuiz,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  listAttempts,
  attemptDetails,
  gradeShortAnswer
};
