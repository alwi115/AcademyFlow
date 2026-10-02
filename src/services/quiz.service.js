const Assessment = require('../models/Assessment');
const QuizQuestion = require('../models/QuizQuestion');

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeAudioUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    const err = new Error('رابط مقطع الاستماع غير صحيح');
    err.status = 400;
    throw err;
  }

  const input = value.trim();
  if (!input) return '';
  if (input.length > 2048) {
    const err = new Error('رابط مقطع الاستماع طويل جدًا');
    err.status = 400;
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    const err = new Error('رابط مقطع الاستماع غير صحيح');
    err.status = 400;
    throw err;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    const err = new Error('مقطع الاستماع يجب أن يستخدم رابط HTTPS آمنًا');
    err.status = 400;
    throw err;
  }

  return parsed.toString();
}

function normalizeAudioTitle(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    const err = new Error('عنوان مقطع الاستماع غير صحيح');
    err.status = 400;
    throw err;
  }
  return value.trim().slice(0, 200);
}

async function recalcQuizMarks(academyId, assessmentId) {
  const rows = await QuizQuestion.find({
    academyId,
    assessmentId
  }).select('marks').lean();

  const totalMarks = Math.max(
    1,
    rows.reduce((sum, row) => sum + Number(row.marks || 0), 0)
  );

  await Assessment.updateOne(
    { _id: assessmentId, academyId, type: 'quiz' },
    { $set: { totalMarks } }
  );

  return totalMarks;
}

function normalizeQuestionPayload(body = {}) {
  const type = String(body.type || '').trim();
  const prompt = String(body.prompt || '').trim();
  const marks = Number(body.marks || 1);
  const order = Number(body.order || 1);
  const explanation = String(body.explanation || '').trim();
  const audioUrl = normalizeAudioUrl(body.audioUrl);
  const audioTitle = normalizeAudioTitle(body.audioTitle);

  if (!['multiple_choice','true_false','short_answer'].includes(type)) {
    const err = new Error('نوع السؤال غير صحيح');
    err.status = 400;
    throw err;
  }

  if (!prompt) {
    const err = new Error('نص السؤال مطلوب');
    err.status = 400;
    throw err;
  }

  if (!Number.isFinite(marks) || marks < 0.25 || marks > 1000) {
    const err = new Error('درجة السؤال غير صحيحة');
    err.status = 400;
    throw err;
  }

  if (!Number.isFinite(order) || order < 1) {
    const err = new Error('ترتيب السؤال غير صحيح');
    err.status = 400;
    throw err;
  }

  const payload = {
    type,
    prompt,
    marks,
    order,
    explanation,
    audioUrl,
    audioTitle,
    options: [],
    correctBoolean: null
  };

  if (type === 'multiple_choice') {
    const options = Array.isArray(body.options) ? body.options : [];

    if (options.length < 2 || options.length > 8) {
      const err = new Error('سؤال الاختيار من متعدد يحتاج من خيارين إلى 8 خيارات');
      err.status = 400;
      throw err;
    }

    const normalized = options.map(item => ({
      text: String(item?.text || '').trim(),
      isCorrect: Boolean(item?.isCorrect)
    }));

    if (normalized.some(item => !item.text)) {
      const err = new Error('نص كل خيار مطلوب');
      err.status = 400;
      throw err;
    }

    if (normalized.filter(item => item.isCorrect).length !== 1) {
      const err = new Error('حدد إجابة صحيحة واحدة فقط');
      err.status = 400;
      throw err;
    }

    payload.options = normalized;
  }

  if (type === 'true_false') {
    if (typeof body.correctBoolean !== 'boolean') {
      const err = new Error('حدد الإجابة الصحيحة: صح أو خطأ');
      err.status = 400;
      throw err;
    }
    payload.correctBoolean = body.correctBoolean;
  }

  return payload;
}

function orderedQuestions(questions, questionOrder = []) {
  const map = new Map(questions.map(q => [String(q._id), q]));
  const ordered = questionOrder
    .map(id => map.get(String(id)))
    .filter(Boolean);

  const used = new Set(ordered.map(q => String(q._id)));
  for (const q of questions) {
    if (!used.has(String(q._id))) ordered.push(q);
  }
  return ordered;
}

function studentQuestion(question, optionOrder = []) {
  let options = (question.options || []).map(option => ({
    id: String(option._id),
    text: option.text
  }));

  if (optionOrder?.length) {
    const map = new Map(options.map(option => [option.id, option]));
    options = optionOrder.map(id => map.get(String(id))).filter(Boolean);
  }

  return {
    id: String(question._id),
    type: question.type,
    prompt: question.prompt,
    marks: question.marks,
    order: question.order,
    audio: question.audioUrl ? {
      url: question.audioUrl,
      title: question.audioTitle || 'مقطع الاستماع'
    } : null,
    options
  };
}

function answerFor(attempt, questionId) {
  return attempt.answers.find(item => String(item.questionId) === String(questionId));
}

function ensureAnswer(attempt, question) {
  let answer = answerFor(attempt, question._id);

  if (!answer) {
    attempt.answers.push({
      questionId: question._id,
      selectedOptionId: '',
      booleanAnswer: null,
      textAnswer: '',
      awardedMarks: null,
      isCorrect: null,
      needsManualReview: false,
      feedback: ''
    });
    answer = attempt.answers[attempt.answers.length - 1];
  }

  return answer;
}

function gradeObjective(question, answer) {
  if (question.type === 'multiple_choice') {
    const correct = (question.options || []).find(option => option.isCorrect);
    const ok = Boolean(correct) && String(answer.selectedOptionId || '') === String(correct._id);
    answer.awardedMarks = ok ? Number(question.marks) : 0;
    answer.isCorrect = ok;
    answer.needsManualReview = false;
    return;
  }

  if (question.type === 'true_false') {
    const answered = typeof answer.booleanAnswer === 'boolean';
    const ok = answered && answer.booleanAnswer === question.correctBoolean;
    answer.awardedMarks = ok ? Number(question.marks) : 0;
    answer.isCorrect = ok;
    answer.needsManualReview = false;
  }
}

function recomputeAttempt(attempt, assessment) {
  let score = 0;
  let pending = false;

  for (const answer of attempt.answers) {
    if (answer.needsManualReview) pending = true;
    if (typeof answer.awardedMarks === 'number') {
      score += Number(answer.awardedMarks || 0);
    }
  }

  const total = Math.max(1, Number(attempt.totalMarks || assessment.totalMarks || 1));
  const percentage = Math.max(0, Math.min(100, Math.round((score / total) * 10000) / 100));

  attempt.score = Math.round(score * 100) / 100;
  attempt.percentage = percentage;
  attempt.requiresManualReview = pending;
  attempt.passed = !pending && percentage >= Number(assessment.passingPercentage ?? 50);

  if (attempt.status !== 'in_progress') {
    attempt.status = pending ? 'pending_review' : 'graded';
  }

  return attempt;
}

async function finalizeAttempt(attempt, assessment, questions, { expired = false } = {}) {
  if (attempt.status !== 'in_progress') {
    return attempt;
  }

  for (const question of questions) {
    const answer = ensureAnswer(attempt, question);

    if (question.type === 'short_answer') {
      const hasText = Boolean(String(answer.textAnswer || '').trim());
      answer.awardedMarks = hasText ? null : 0;
      answer.isCorrect = hasText ? null : false;
      answer.needsManualReview = hasText;
    } else {
      gradeObjective(question, answer);
    }
  }

  attempt.submittedAt = new Date();
  attempt.status = expired ? 'expired' : 'submitted';
  recomputeAttempt(attempt, assessment);

  if (attempt.requiresManualReview) {
    attempt.status = 'pending_review';
  } else {
    attempt.status = 'graded';
  }

  await attempt.save();
  return attempt;
}

function correctAnswerPayload(question) {
  if (question.type === 'multiple_choice') {
    const correct = (question.options || []).find(option => option.isCorrect);
    return {
      correctOptionId: correct ? String(correct._id) : null,
      correctOptionText: correct?.text || null
    };
  }

  if (question.type === 'true_false') {
    return { correctBoolean: question.correctBoolean };
  }

  return {};
}

module.exports = {
  shuffle,
  normalizeAudioUrl,
  recalcQuizMarks,
  normalizeQuestionPayload,
  orderedQuestions,
  studentQuestion,
  answerFor,
  ensureAnswer,
  gradeObjective,
  recomputeAttempt,
  finalizeAttempt,
  correctAnswerPayload
};
