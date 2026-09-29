const Assessment = require('../models/Assessment');
const QuizQuestion = require('../models/QuizQuestion');
const Lesson = require('../models/Lesson');
const {
  assertDirectCourse
} = require('../services/instructor-scope.service');
const {
  normalizeQuestionPayload,
  recalcQuizMarks
} = require('../services/quiz.service');
const ai = require('../services/ai.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeHistory(value) {
  return Array.isArray(value) ? value : [];
}

async function context(req, res) {
  res.json(await ai.contextOptions(req));
}

async function chat(req, res) {
  const result = await ai.chat(req, {
    message: req.body.message,
    courseId: clean(req.body.courseId),
    lessonId: clean(req.body.lessonId),
    history: safeHistory(req.body.history)
  });

  res.json(result);
}

async function summarize(req, res) {
  const result = await ai.summarize(req, {
    courseId: clean(req.body.courseId),
    lessonId: clean(req.body.lessonId)
  });

  res.json(result);
}

function aiQuestionToPayload(question, order) {
  const type = String(question?.type || '').trim();
  const prompt = String(question?.prompt || '').trim();
  const explanation = String(question?.explanation || '').trim();
  const marks = Math.max(0.25, Math.min(100, Number(question?.marks || 1)));

  if (type === 'multiple_choice') {
    const rawOptions = Array.isArray(question.options)
      ? question.options.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [];

    const options = [...new Set(rawOptions)];
    const index = Math.max(0, Math.min(options.length - 1, Number(question.correctOptionIndex || 0)));

    return normalizeQuestionPayload({
      type,
      prompt,
      marks,
      order,
      explanation,
      options: options.map((text, optionIndex) => ({
        text,
        isCorrect: optionIndex === index
      }))
    });
  }

  if (type === 'true_false') {
    return normalizeQuestionPayload({
      type,
      prompt,
      marks,
      order,
      explanation,
      correctBoolean: Boolean(question.correctBoolean)
    });
  }

  const modelAnswer = String(question?.modelAnswer || '').trim();
  const mergedExplanation = [
    modelAnswer ? `الإجابة النموذجية: ${modelAnswer}` : '',
    explanation
  ].filter(Boolean).join('\n\n');

  return normalizeQuestionPayload({
    type: 'short_answer',
    prompt,
    marks,
    order,
    explanation: mergedExplanation
  });
}

async function createQuizDraft(req, res) {
  if (req.user.role !== 'instructor') {
    return res.status(403).json({ message: 'هذه الميزة متاحة للمدربين فقط' });
  }

  const courseId = clean(req.body.courseId);
  const lessonId = clean(req.body.lessonId);

  if (!courseId) {
    return res.status(400).json({ message: 'اختر الدورة أولًا' });
  }

  const course = await assertDirectCourse(req, courseId);

  if (lessonId) {
    const lesson = await Lesson.findOne({
      _id: lessonId,
      academyId: req.academyId,
      courseId: course._id
    }).select('_id');

    if (!lesson) {
      return res.status(404).json({ message: 'الدرس غير موجود داخل الدورة المحددة' });
    }
  }

  const generated = await ai.generateQuiz(req, {
    courseId,
    lessonId,
    count: req.body.count,
    difficulty: clean(req.body.difficulty)
  });

  const title = clean(generated.draft.title) || `اختبار ذكي - ${course.title}`;
  const description = clean(generated.draft.description) || 'مسودة مولدة بواسطة AcademyFlow AI. راجع الأسئلة قبل النشر.';

  const quiz = await Assessment.create({
    academyId: req.academyId,
    courseId: course._id,
    type: 'quiz',
    title: title.slice(0, 500),
    description: description.slice(0, 5000),
    durationMinutes: 0,
    maxAttempts: 1,
    passingPercentage: 50,
    shuffleQuestions: true,
    shuffleOptions: true,
    showCorrectAnswers: false,
    totalMarks: 1,
    status: 'draft'
  });

  try {
    const payloads = generated.draft.questions.map((question, index) => (
      aiQuestionToPayload(question, index + 1)
    ));

    if (!payloads.length) throw new Error('لم يتم إنشاء أسئلة صالحة');

    const created = [];
    for (const payload of payloads) {
      created.push(await QuizQuestion.create({
        academyId: req.academyId,
        assessmentId: quiz._id,
        courseId: course._id,
        ...payload
      }));
    }

    const totalMarks = await recalcQuizMarks(req.academyId, quiz._id);

    return res.status(201).json({
      quiz: {
        id: String(quiz._id),
        title: quiz.title,
        description: quiz.description,
        courseId: String(course._id),
        courseTitle: course.title,
        status: quiz.status,
        totalMarks
      },
      questionCount: created.length,
      model: generated.model
    });
  } catch (err) {
    await Promise.allSettled([
      QuizQuestion.deleteMany({ academyId: req.academyId, assessmentId: quiz._id }),
      Assessment.deleteOne({ _id: quiz._id, academyId: req.academyId })
    ]);
    throw err;
  }
}

module.exports = {
  context,
  chat,
  summarize,
  createQuizDraft
};
