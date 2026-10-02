const Assessment = require('../models/Assessment');
const Enrollment = require('../models/Enrollment');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAttempt = require('../models/QuizAttempt');
const Academy = require('../models/Academy');
const {
  shuffle,
  orderedQuestions,
  studentQuestion,
  ensureAnswer,
  finalizeAttempt,
  correctAnswerPayload
} = require('../services/quiz.service');
const { safeTimeZone, formatAcademyInput, formatAcademyDisplay } = require('../services/timezone.service');

async function enrolledCourseIds(academyId, studentId) {
  const rows = await Enrollment.find({
    academyId,
    studentId,
    status: { $in: ['active','paused','completed'] }
  }).select('courseId');

  return rows.map(row => row.courseId);
}

async function assertEnrolled(academyId, studentId, courseId) {
  const row = await Enrollment.findOne({
    academyId,
    studentId,
    courseId,
    status: { $in: ['active','paused','completed'] }
  });

  if (!row) {
    const err = new Error('هذا الاختبار ليس ضمن دوراتك');
    err.status = 403;
    throw err;
  }

  return row;
}

async function getQuiz(academyId, quizId) {
  const quiz = await Assessment.findOne({
    _id: quizId,
    academyId,
    type: 'quiz'
  }).populate('courseId', 'title code');

  if (!quiz) {
    const err = new Error('الاختبار غير موجود');
    err.status = 404;
    throw err;
  }

  return quiz;
}

async function loadQuestions(academyId, quizId, withAnswers = true) {
  let query = QuizQuestion.find({
    academyId,
    assessmentId: quizId
  }).sort({ order: 1, createdAt: 1 });

  if (withAnswers) {
    query = query.select('+correctBoolean +explanation +options.isCorrect');
  }

  return query;
}

function attemptSummary(row) {
  return {
    id: row._id,
    attemptNumber: row.attemptNumber,
    status: row.status,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    submittedAt: row.submittedAt,
    score: row.score,
    totalMarks: row.totalMarks,
    percentage: row.percentage,
    passed: row.passed,
    requiresManualReview: row.requiresManualReview
  };
}

function remainingSeconds(attempt) {
  if (!attempt.expiresAt || attempt.status !== 'in_progress') return null;
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

function serializeAttempt(attempt, quiz, questions) {
  const ordered = orderedQuestions(questions, attempt.questionOrder);
  const answerMap = new Map(
    attempt.answers.map(answer => [String(answer.questionId), answer])
  );

  return {
    quiz: {
      id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      course: quiz.courseId,
      durationMinutes: quiz.durationMinutes,
      maxAttempts: quiz.maxAttempts,
      passingPercentage: quiz.passingPercentage,
      dueAt: quiz.dueAt,
      totalMarks: attempt.totalMarks
    },
    attempt: {
      ...attemptSummary(attempt),
      remainingSeconds: remainingSeconds(attempt)
    },
    questions: ordered.map(question => {
      const answer = answerMap.get(String(question._id));
      return {
        ...studentQuestion(
          question,
          attempt.optionOrders?.[String(question._id)] || []
        ),
        answer: answer ? {
          selectedOptionId: answer.selectedOptionId || '',
          booleanAnswer: answer.booleanAnswer,
          textAnswer: answer.textAnswer || ''
        } : null
      };
    })
  };
}

async function expireIfNeeded(attempt, quiz, questions) {
  if (
    attempt.status === 'in_progress' &&
    attempt.expiresAt &&
    new Date(attempt.expiresAt).getTime() <= Date.now()
  ) {
    await finalizeAttempt(attempt, quiz, questions, { expired: true });
  }

  return attempt;
}

async function listQuizzes(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const academy = await Academy.findById(academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const courseIds = await enrolledCourseIds(academyId, studentId);

  const quizzes = await Assessment.find({
    academyId,
    courseId: { $in: courseIds },
    type: 'quiz',
    status: { $in: ['published','closed'] }
  })
    .populate('courseId', 'title code')
    .sort({ dueAt: 1, createdAt: -1 });

  const attempts = await QuizAttempt.find({
    academyId,
    studentId,
    assessmentId: { $in: quizzes.map(row => row._id) }
  }).sort({ attemptNumber: -1 });

  const grouped = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.assessmentId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(attempt);
  }

  const now = new Date();

  const rows = [];

  for (const quiz of quizzes) {
    const quizAttempts = grouped.get(String(quiz._id)) || [];
    const inProgress = quizAttempts.find(row => row.status === 'in_progress');

    if (
      inProgress &&
      inProgress.expiresAt &&
      new Date(inProgress.expiresAt).getTime() <= Date.now()
    ) {
      const questions = await loadQuestions(academyId, quiz._id, true);
      await expireIfNeeded(inProgress, quiz, questions);
    }

    const refreshed = quizAttempts.map(attemptSummary);
    const active = refreshed.find(row => row.status === 'in_progress');

    rows.push({
      id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      course: quiz.courseId,
      availableFrom: quiz.availableFrom,
      availableFromLocal: formatAcademyInput(quiz.availableFrom, timezone),
      availableFromDisplay: formatAcademyDisplay(quiz.availableFrom, timezone),
      dueAt: quiz.dueAt,
      dueAtLocal: formatAcademyInput(quiz.dueAt, timezone),
      dueAtDisplay: formatAcademyDisplay(quiz.dueAt, timezone),
      timezone,
      durationMinutes: quiz.durationMinutes,
      maxAttempts: quiz.maxAttempts,
      passingPercentage: quiz.passingPercentage,
      totalMarks: quiz.totalMarks,
      status: quiz.status,
      canStart:
        quiz.status === 'published' &&
        (!quiz.availableFrom || new Date(quiz.availableFrom) <= now) &&
        (!quiz.dueAt || new Date(quiz.dueAt) > now) &&
        refreshed.length < Number(quiz.maxAttempts || 1) &&
        !active,
      activeAttempt: active || null,
      attempts: refreshed
    });
  }

  res.json(rows);
}

async function startQuiz(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const quiz = await getQuiz(academyId, req.params.id);

  await assertEnrolled(
    academyId,
    studentId,
    quiz.courseId?._id || quiz.courseId
  );

  const now = new Date();

  if (quiz.status !== 'published') {
    return res.status(409).json({ message: 'الاختبار غير متاح للبدء حاليًا' });
  }

  if (quiz.availableFrom && new Date(quiz.availableFrom) > now) {
    return res.status(409).json({ message: 'لم يبدأ موعد الاختبار بعد' });
  }

  if (quiz.dueAt && new Date(quiz.dueAt) <= now) {
    return res.status(409).json({ message: 'انتهى موعد الاختبار' });
  }

  const questions = await loadQuestions(academyId, quiz._id, true);

  if (!questions.length) {
    return res.status(409).json({ message: 'الاختبار لا يحتوي على أسئلة' });
  }

  let active = await QuizAttempt.findOne({
    academyId,
    studentId,
    assessmentId: quiz._id,
    status: 'in_progress'
  }).sort({ attemptNumber: -1 });

  if (active) {
    await expireIfNeeded(active, quiz, questions);

    if (active.status === 'in_progress') {
      return res.json(serializeAttempt(active, quiz, questions));
    }
  }

  const usedAttempts = await QuizAttempt.countDocuments({
    academyId,
    studentId,
    assessmentId: quiz._id
  });

  if (usedAttempts >= Number(quiz.maxAttempts || 1)) {
    return res.status(409).json({ message: 'استخدمت جميع المحاولات المتاحة' });
  }

  const ordered = quiz.shuffleQuestions ? shuffle(questions) : questions;
  const optionOrders = {};

  for (const question of ordered) {
    if (question.type !== 'multiple_choice') continue;

    const ids = (question.options || []).map(option => String(option._id));
    optionOrders[String(question._id)] = quiz.shuffleOptions
      ? shuffle(ids)
      : ids;
  }

  let expiresAt = null;

  if (Number(quiz.durationMinutes || 0) > 0) {
    expiresAt = new Date(
      now.getTime() + Number(quiz.durationMinutes) * 60 * 1000
    );

    if (quiz.dueAt && expiresAt > new Date(quiz.dueAt)) {
      expiresAt = new Date(quiz.dueAt);
    }
  } else if (quiz.dueAt) {
    expiresAt = new Date(quiz.dueAt);
  }

  const totalMarks = questions.reduce(
    (sum, question) => sum + Number(question.marks || 0),
    0
  );

  const attempt = await QuizAttempt.create({
    academyId,
    assessmentId: quiz._id,
    courseId: quiz.courseId?._id || quiz.courseId,
    studentId,
    attemptNumber: usedAttempts + 1,
    startedAt: now,
    expiresAt,
    questionOrder: ordered.map(question => question._id),
    optionOrders,
    totalMarks
  });

  res.status(201).json(serializeAttempt(attempt, quiz, questions));
}

async function getAttempt(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;

  const attempt = await QuizAttempt.findOne({
    _id: req.params.attemptId,
    academyId,
    studentId
  });

  if (!attempt) {
    return res.status(404).json({ message: 'المحاولة غير موجودة' });
  }

  const quiz = await getQuiz(academyId, attempt.assessmentId);
  const questions = await loadQuestions(academyId, quiz._id, true);

  await expireIfNeeded(attempt, quiz, questions);

  if (attempt.status !== 'in_progress') {
    return res.json({
      completed: true,
      attempt: attemptSummary(attempt)
    });
  }

  res.json(serializeAttempt(attempt, quiz, questions));
}

async function saveAnswer(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;

  const attempt = await QuizAttempt.findOne({
    _id: req.params.attemptId,
    academyId,
    studentId
  });

  if (!attempt) {
    return res.status(404).json({ message: 'المحاولة غير موجودة' });
  }

  const quiz = await getQuiz(academyId, attempt.assessmentId);
  const questions = await loadQuestions(academyId, quiz._id, true);

  await expireIfNeeded(attempt, quiz, questions);

  if (attempt.status !== 'in_progress') {
    return res.status(409).json({
      message: 'انتهت هذه المحاولة',
      attempt: attemptSummary(attempt)
    });
  }

  const question = questions.find(
    row => String(row._id) === String(req.params.questionId)
  );

  if (!question) {
    return res.status(404).json({ message: 'السؤال غير موجود' });
  }

  if (
    attempt.questionOrder.length &&
    !attempt.questionOrder.some(id => String(id) === String(question._id))
  ) {
    return res.status(403).json({ message: 'السؤال لا ينتمي لهذه المحاولة' });
  }

  const answer = ensureAnswer(attempt, question);

  if (question.type === 'multiple_choice') {
    const selected = String(req.body.selectedOptionId || '');
    const valid = (question.options || []).some(
      option => String(option._id) === selected
    );

    if (!valid) {
      return res.status(400).json({ message: 'الخيار المحدد غير صحيح' });
    }

    answer.selectedOptionId = selected;
    answer.booleanAnswer = null;
    answer.textAnswer = '';
  }

  if (question.type === 'true_false') {
    if (typeof req.body.booleanAnswer !== 'boolean') {
      return res.status(400).json({ message: 'اختر صح أو خطأ' });
    }

    answer.booleanAnswer = req.body.booleanAnswer;
    answer.selectedOptionId = '';
    answer.textAnswer = '';
  }

  if (question.type === 'short_answer') {
    const text = String(req.body.textAnswer || '').trim();

    if (text.length > 10000) {
      return res.status(400).json({ message: 'الإجابة النصية طويلة جدًا' });
    }

    answer.textAnswer = text;
    answer.selectedOptionId = '';
    answer.booleanAnswer = null;
  }

  await attempt.save();

  res.json({
    ok: true,
    savedAt: new Date().toISOString(),
    remainingSeconds: remainingSeconds(attempt)
  });
}

async function submitQuiz(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;

  const attempt = await QuizAttempt.findOne({
    _id: req.params.attemptId,
    academyId,
    studentId
  });

  if (!attempt) {
    return res.status(404).json({ message: 'المحاولة غير موجودة' });
  }

  const quiz = await getQuiz(academyId, attempt.assessmentId);
  const questions = await loadQuestions(academyId, quiz._id, true);

  if (attempt.status === 'in_progress') {
    const expired = Boolean(
      attempt.expiresAt &&
      new Date(attempt.expiresAt).getTime() <= Date.now()
    );

    await finalizeAttempt(attempt, quiz, questions, { expired });
  }

  res.json({
    ok: true,
    attempt: attemptSummary(attempt),
    resultUrl: '/student/quiz.html?result=' + encodeURIComponent(attempt._id)
  });
}

async function quizResult(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;

  const attempt = await QuizAttempt.findOne({
    _id: req.params.attemptId,
    academyId,
    studentId
  });

  if (!attempt) {
    return res.status(404).json({ message: 'النتيجة غير موجودة' });
  }

  const quiz = await getQuiz(academyId, attempt.assessmentId);
  const questions = await loadQuestions(academyId, quiz._id, true);

  await expireIfNeeded(attempt, quiz, questions);

  if (attempt.status === 'in_progress') {
    return res.status(409).json({ message: 'المحاولة ما زالت جارية' });
  }

  const ordered = orderedQuestions(questions, attempt.questionOrder);
  const answerMap = new Map(
    attempt.answers.map(answer => [String(answer.questionId), answer])
  );

  const reveal = Boolean(quiz.showCorrectAnswers);

  res.json({
    quiz: {
      id: quiz._id,
      title: quiz.title,
      course: quiz.courseId,
      passingPercentage: quiz.passingPercentage,
      showCorrectAnswers: reveal
    },
    attempt: attemptSummary(attempt),
    questions: ordered.map(question => {
      const answer = answerMap.get(String(question._id));

      return {
        id: question._id,
        type: question.type,
        prompt: question.prompt,
        marks: question.marks,
        audio: studentQuestion(question, attempt.optionOrders?.[String(question._id)] || []).audio,
        options: studentQuestion(question, attempt.optionOrders?.[String(question._id)] || []).options,
        answer: answer ? {
          selectedOptionId: answer.selectedOptionId || '',
          booleanAnswer: answer.booleanAnswer,
          textAnswer: answer.textAnswer || '',
          awardedMarks: answer.awardedMarks,
          isCorrect: answer.isCorrect,
          feedback: answer.feedback || '',
          needsManualReview: answer.needsManualReview
        } : null,
        ...(reveal ? {
          correctAnswer: correctAnswerPayload(question),
          explanation: question.explanation || ''
        } : {})
      };
    })
  });
}

module.exports = {
  listQuizzes,
  startQuiz,
  getAttempt,
  saveAnswer,
  submitQuiz,
  quizResult
};
