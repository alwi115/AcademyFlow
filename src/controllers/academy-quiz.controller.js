const Assessment = require('../models/Assessment');
const Course = require('../models/Course');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAttempt = require('../models/QuizAttempt');
const {
  recalcQuizMarks,
  normalizeQuestionPayload,
  recomputeAttempt
} = require('../services/quiz.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function manageableCourseIds(req) {
  if (req.user.role !== 'instructor') return null;

  const rows = await Course.find({
    academyId: req.academyId,
    instructorId: req.user.sub
  }).select('_id');

  return rows.map(row => row._id);
}

async function assertCourseAccess(req, courseId) {
  const course = await Course.findOne({
    _id: courseId,
    academyId: req.academyId
  });

  if (!course) {
    const err = new Error('الدورة غير موجودة في هذه الأكاديمية');
    err.status = 404;
    throw err;
  }

  if (
    req.user.role === 'instructor' &&
    String(course.instructorId || '') !== String(req.user.sub)
  ) {
    const err = new Error('لا تملك صلاحية إدارة اختبارات هذه الدورة');
    err.status = 403;
    throw err;
  }

  return course;
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

  if (
    req.user.role === 'instructor' &&
    String(quiz.courseId?.instructorId || '') !== String(req.user.sub)
  ) {
    const err = new Error('لا تملك صلاحية إدارة هذا الاختبار');
    err.status = 403;
    throw err;
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
  const query = {
    academyId: req.academyId,
    type: 'quiz'
  };

  if (courseIds) query.courseId = { $in: courseIds };

  const rows = await Assessment.find(query)
    .populate('courseId', 'title code instructorId')
    .sort({ createdAt: -1 });

  const result = await Promise.all(rows.map(async quiz => {
    const [questionCount, attemptCount, gradedCount, pendingReviewCount] = await Promise.all([
      QuizQuestion.countDocuments({ academyId: req.academyId, assessmentId: quiz._id }),
      QuizAttempt.countDocuments({ academyId: req.academyId, assessmentId: quiz._id }),
      QuizAttempt.countDocuments({ academyId: req.academyId, assessmentId: quiz._id, status: 'graded' }),
      QuizAttempt.countDocuments({ academyId: req.academyId, assessmentId: quiz._id, status: 'pending_review' })
    ]);

    return {
      ...quiz.toObject(),
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

  await assertCourseAccess(req, courseId);

  const quiz = await Assessment.create({
    academyId: req.academyId,
    courseId,
    type: 'quiz',
    title: clean(title),
    description: clean(description),
    availableFrom: availableFrom || null,
    dueAt: dueAt || null,
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

  const [questions, attempts] = await Promise.all([
    QuizQuestion.find({
      academyId: req.academyId,
      assessmentId: quiz._id
    })
      .select('+correctBoolean +explanation +options.isCorrect')
      .sort({ order: 1, createdAt: 1 }),
    QuizAttempt.find({
      academyId: req.academyId,
      assessmentId: quiz._id
    })
      .populate('studentId', 'name email')
      .sort({ createdAt: -1 })
  ]);

  res.json({
    quiz,
    questions,
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

  if (req.body.availableFrom !== undefined) quiz.availableFrom = req.body.availableFrom || null;
  if (req.body.dueAt !== undefined) quiz.dueAt = req.body.dueAt || null;

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
    }

    quiz.status = req.body.status;
  }

  await quiz.save();
  res.json(quiz);
}

async function createQuestion(req, res) {
  const quiz = await getQuizForAdmin(req, req.params.id);
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

  const rows = await QuizAttempt.find({
    academyId: req.academyId,
    assessmentId: quiz._id
  })
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

  const attempt = await QuizAttempt.findOne({
    _id: req.params.attemptId,
    academyId: req.academyId,
    assessmentId: quiz._id
  }).populate('studentId', 'name email');

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
    QuizAttempt.findOne({
      _id: req.params.attemptId,
      academyId: req.academyId,
      assessmentId: quiz._id
    }),
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
