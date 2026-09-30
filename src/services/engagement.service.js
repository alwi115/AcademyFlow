const Academy = require('../models/Academy');
const User = require('../models/User');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Enrollment = require('../models/Enrollment');
const LiveSession = require('../models/LiveSession');
const LiveAttendance = require('../models/LiveAttendance');
const Assessment = require('../models/Assessment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Payment = require('../models/Payment');
const QuizQuestion = require('../models/QuizQuestion');
const QuizAttempt = require('../models/QuizAttempt');
const CompensationModule = require('../models/CompensationModule');
const CompensationProgress = require('../models/CompensationProgress');
const SessionFeedback = require('../models/SessionFeedback');
const {
  instructorScope,
  assertCourse: assertInstructorCourse,
  studentCourseAccessFilter
} = require('./instructor-scope.service');

const ACTIVE_ENROLLMENT_STATUSES = ['active','paused','completed'];
const FINAL_ATTEMPT_STATUSES = ['graded'];
const COMPENSATION_LOOKBACK_DAYS = 120;
const FEEDBACK_LOOKBACK_DAYS = 21;
const RISK_LOOKBACK_DAYS = 60;
const PAYMENT_FALLBACK_OVERDUE_DAYS = 7;

function clean(value, max = 1200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > max ? text.slice(0, max) : text;
}

function uniq(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function settingsFromAcademy(academy) {
  const raw = academy?.engagementFeatures || {};
  return {
    compensationEnabled: raw.compensationEnabled !== false,
    gapMapEnabled: raw.gapMapEnabled !== false,
    compensationPassingPercentage: Math.max(
      0,
      Math.min(100, Number(raw.compensationPassingPercentage ?? 60))
    )
  };
}

async function getSettings(academyId) {
  const academy = await Academy.findById(academyId).select('engagementFeatures');
  if (!academy) {
    const err = new Error('الأكاديمية غير موجودة');
    err.status = 404;
    throw err;
  }
  return settingsFromAcademy(academy);
}

async function updateSettings(academyId, body = {}) {
  const academy = await Academy.findById(academyId);
  if (!academy) {
    const err = new Error('الأكاديمية غير موجودة');
    err.status = 404;
    throw err;
  }

  const current = settingsFromAcademy(academy);
  academy.engagementFeatures = {
    compensationEnabled:
      body.compensationEnabled === undefined
        ? current.compensationEnabled
        : Boolean(body.compensationEnabled),
    gapMapEnabled:
      body.gapMapEnabled === undefined
        ? current.gapMapEnabled
        : Boolean(body.gapMapEnabled),
    compensationPassingPercentage: current.compensationPassingPercentage
  };

  await academy.save();
  return settingsFromAcademy(academy);
}

function sessionMatchesEnrollment(session, enrollment) {
  if (String(session.courseId) !== String(enrollment.courseId)) return false;
  if (!session.groupId) return true;
  return String(session.groupId) === String(enrollment.groupId || '');
}

function attendanceCoversSession(row) {
  if (!row) return false;
  if (row.attendanceStatus === 'compensated' || row.attendanceStatus === 'excused') return true;
  if (
    row.verifiedByZoom &&
    ['present','late'].includes(row.attendanceStatus)
  ) return true;
  if (
    row.manualOverride &&
    ['present','late'].includes(row.attendanceStatus)
  ) return true;
  return false;
}

function buildChoiceQuestion(lesson, lessons, index, sessionTitle) {
  const otherTitles = lessons
    .filter(row => String(row._id) !== String(lesson._id))
    .map(row => clean(row.title, 180))
    .filter(Boolean);

  let options = uniq([
    clean(lesson.title, 180),
    ...otherTitles,
    'موضوع آخر غير مرتبط'
  ]).slice(0, 4);

  if (options.length < 2) options = [clean(lesson.title, 180), 'موضوع آخر غير مرتبط'];

  const correct = clean(lesson.title, 180);
  const shift = index % options.length;
  options = [...options.slice(shift), ...options.slice(0, shift)];
  const correctIndex = options.indexOf(correct);

  const description = clean(lesson.description, 180);
  const prompt = description
    ? `أي درس يرتبط بالنقطة التالية: «${description}»؟`
    : `أي درس يدخل ضمن مراجعة حصة «${clean(sessionTitle, 180)}»؟`;

  return {
    prompt,
    options,
    correctIndex: Math.max(0, correctIndex),
    lessonId: lesson._id
  };
}

async function buildCompensationModule(session, passingPercentage = 60) {
  let module = await CompensationModule.findOne({
    academyId: session.academyId,
    liveSessionId: session._id
  });

  if (module) return module;

  const [course, lessons] = await Promise.all([
    Course.findOne({
      _id: session.courseId,
      academyId: session.academyId
    }).select('title code description'),
    Lesson.find({
      academyId: session.academyId,
      courseId: session.courseId,
      status: 'published'
    })
      .select('_id title description order')
      .sort({ order: 1, createdAt: 1 })
      .limit(8)
  ]);

  const sourceLessons = lessons.slice(0, 5);
  const sessionDescription = clean(session.description, 1800);
  const courseDescription = clean(course?.description, 1400);

  const keyPoints = sourceLessons.length
    ? sourceLessons.map(lesson => {
        const description = clean(lesson.description, 320);
        return description
          ? `الدرس ${lesson.order}: ${clean(lesson.title, 180)} — ${description}`
          : `الدرس ${lesson.order}: ${clean(lesson.title, 180)}`;
      })
    : [
        sessionDescription ||
        courseDescription ||
        `راجع محتوى حصة «${clean(session.title, 220)}» مع مدرسك.`
      ];

  const summaryParts = [
    `حزمة تعويض لحصة «${clean(session.title, 220)}» ضمن ${clean(course?.title || 'الدورة', 220)}.`,
    sessionDescription ? `وصف الحصة: ${sessionDescription}` : '',
    keyPoints.length ? 'تركّز المراجعة على النقاط والدروس المدرجة أدناه.' : ''
  ].filter(Boolean);

  let quiz = sourceLessons.slice(0, 3).map((lesson, index) =>
    buildChoiceQuestion(lesson, sourceLessons, index, session.title)
  );

  if (!quiz.length) {
    const correct = clean(session.title, 180) || 'الحصة الحالية';
    quiz = [{
      prompt: 'ما الحصة التي تعوضها هذه الحزمة؟',
      options: [correct, 'حصة أخرى غير مرتبطة', 'مراجعة عامة'],
      correctIndex: 0,
      lessonId: null
    }];
  }

  try {
    module = await CompensationModule.create({
      academyId: session.academyId,
      liveSessionId: session._id,
      courseId: session.courseId,
      title: `تعويض: ${clean(session.title, 220)}`,
      summary: summaryParts.join('\n\n'),
      keyPoints,
      sourceLessonIds: sourceLessons.map(row => row._id),
      quiz,
      passingPercentage
    });
  } catch (err) {
    if (err?.code === 11000) {
      module = await CompensationModule.findOne({
        academyId: session.academyId,
        liveSessionId: session._id
      });
    } else {
      throw err;
    }
  }

  return module;
}

async function ensureSessionCompensations(session) {
  const featureSettings = await getSettings(session.academyId);
  if (!featureSettings.compensationEnabled || !session.courseId) return 0;

  const enrollmentQuery = {
    academyId: session.academyId,
    courseId: session.courseId,
    status: { $in: ACTIVE_ENROLLMENT_STATUSES }
  };

  if (session.groupId) enrollmentQuery.groupId = session.groupId;

  const enrollments = await Enrollment.find(enrollmentQuery).select('studentId courseId groupId');
  if (!enrollments.length) return 0;

  const attendanceRows = await LiveAttendance.find({
    academyId: session.academyId,
    liveSessionId: session._id,
    studentId: { $in: enrollments.map(row => row.studentId) }
  }).select('studentId attendanceStatus verifiedByZoom manualOverride');

  const attendanceMap = new Map(
    attendanceRows.map(row => [String(row.studentId), row])
  );

  const missed = enrollments.filter(enrollment =>
    !attendanceCoversSession(attendanceMap.get(String(enrollment.studentId)))
  );

  if (!missed.length) return 0;

  const module = await buildCompensationModule(
    session,
    featureSettings.compensationPassingPercentage
  );

  await CompensationProgress.bulkWrite(
    missed.map(enrollment => ({
      updateOne: {
        filter: {
          academyId: session.academyId,
          liveSessionId: session._id,
          studentId: enrollment.studentId
        },
        update: {
          $setOnInsert: {
            moduleId: module._id,
            courseId: session.courseId,
            status: 'pending',
            attempts: 0,
            bestPercentage: 0
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );

  return missed.length;
}

async function syncStudentCompensations(academyId, studentId) {
  const featureSettings = await getSettings(academyId);
  if (!featureSettings.compensationEnabled) return [];

  const enrollments = await Enrollment.find({
    academyId,
    studentId,
    status: { $in: ACTIVE_ENROLLMENT_STATUSES }
  }).select('courseId groupId');

  if (!enrollments.length) return [];

  const cutoff = new Date(Date.now() - COMPENSATION_LOOKBACK_DAYS * 86400000);
  const liveOr = enrollments.map(row => (
    row.groupId
      ? {
          courseId: row.courseId,
          $or: [{ groupId: null }, { groupId: row.groupId }]
        }
      : { courseId: row.courseId, groupId: null }
  ));

  const sessions = await LiveSession.find({
    academyId,
    status: 'ended',
    startAt: { $gte: cutoff },
    ...(liveOr.length ? { $or: liveOr } : { _id: null })
  })
    .select('_id academyId courseId groupId title description startAt durationMinutes')
    .sort({ startAt: -1 })
    .limit(40);

  if (!sessions.length) return [];

  const attendanceRows = await LiveAttendance.find({
    academyId,
    studentId,
    liveSessionId: { $in: sessions.map(row => row._id) }
  }).select('liveSessionId attendanceStatus verifiedByZoom manualOverride');

  const attendanceMap = new Map(
    attendanceRows.map(row => [String(row.liveSessionId), row])
  );

  for (const session of sessions) {
    const matchingEnrollment = enrollments.find(row =>
      sessionMatchesEnrollment(session, row)
    );
    if (!matchingEnrollment) continue;

    const attendance = attendanceMap.get(String(session._id));
    if (attendanceCoversSession(attendance)) continue;

    const module = await buildCompensationModule(
      session,
      featureSettings.compensationPassingPercentage
    );

    await CompensationProgress.findOneAndUpdate(
      {
        academyId,
        liveSessionId: session._id,
        studentId
      },
      {
        $setOnInsert: {
          moduleId: module._id,
          courseId: session.courseId,
          status: 'pending',
          attempts: 0,
          bestPercentage: 0
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return CompensationProgress.find({
    academyId,
    studentId
  })
    .populate({
      path: 'moduleId',
      select: 'title summary keyPoints quiz passingPercentage sourceLessonIds'
    })
    .populate({
      path: 'liveSessionId',
      select: 'title startAt courseId',
      populate: { path: 'courseId', select: 'title code' }
    })
    .sort({ createdAt: -1 })
    .limit(30);
}

function serializeCompensation(progress) {
  const module = progress.moduleId;
  const session = progress.liveSessionId;
  if (!module || !session) return null;

  return {
    id: String(progress._id),
    sessionId: String(session._id),
    title: module.title,
    sessionTitle: session.title,
    sessionStartAt: session.startAt,
    course: session.courseId
      ? {
          id: String(session.courseId._id || session.courseId),
          title: session.courseId.title || '',
          code: session.courseId.code || ''
        }
      : null,
    summary: module.summary,
    keyPoints: module.keyPoints || [],
    passingPercentage: module.passingPercentage,
    status: progress.status,
    attempts: progress.attempts,
    bestPercentage: progress.bestPercentage,
    completedAt: progress.completedAt || null,
    quiz: (module.quiz || []).map(question => ({
      id: String(question._id),
      prompt: question.prompt,
      options: question.options
    }))
  };
}

async function submitCompensation(req, progressId, answers) {
  const progress = await CompensationProgress.findOne({
    _id: progressId,
    academyId: req.academyId,
    studentId: req.user.sub
  }).populate('moduleId');

  if (!progress?.moduleId) {
    const err = new Error('حزمة التعويض غير موجودة');
    err.status = 404;
    throw err;
  }

  const module = progress.moduleId;
  const answerMap = new Map(
    (Array.isArray(answers) ? answers : []).map(item => [
      String(item?.questionId || ''),
      Number(item?.optionIndex)
    ])
  );

  if (answerMap.size !== module.quiz.length) {
    const err = new Error('أجب عن كل أسئلة حزمة التعويض');
    err.status = 400;
    throw err;
  }

  let correct = 0;
  for (const question of module.quiz) {
    const selected = answerMap.get(String(question._id));
    if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) {
      const err = new Error('إحدى إجابات حزمة التعويض غير صحيحة');
      err.status = 400;
      throw err;
    }
    if (selected === question.correctIndex) correct += 1;
  }

  const percentage = module.quiz.length
    ? Math.round((correct / module.quiz.length) * 100)
    : 0;

  const passed = percentage >= Number(module.passingPercentage || 60);
  progress.attempts = Number(progress.attempts || 0) + 1;
  progress.bestPercentage = Math.max(Number(progress.bestPercentage || 0), percentage);
  progress.lastSubmittedAt = new Date();

  if (passed) {
    progress.status = 'completed';
    progress.completedAt = progress.completedAt || new Date();

    await LiveAttendance.findOneAndUpdate(
      {
        academyId: req.academyId,
        liveSessionId: progress.liveSessionId,
        studentId: req.user.sub
      },
      {
        $set: {
          courseId: progress.courseId,
          attendanceStatus: 'compensated',
          source: 'compensation',
          manualOverride: false,
          note: 'تم تعويض الغياب بعد اجتياز حزمة التعويض.',
          lastEventAt: new Date()
        },
        $setOnInsert: {
          verifiedByZoom: false,
          zoomJoinCount: 0,
          portalJoinCount: 0
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await progress.save();

  return {
    passed,
    percentage,
    passingPercentage: module.passingPercentage,
    status: progress.status,
    attempts: progress.attempts,
    bestPercentage: progress.bestPercentage,
    attendanceStatus: passed ? 'compensated' : 'absent'
  };
}

async function latestAttemptsForStudent(academyId, studentId) {
  const rows = await QuizAttempt.find({
    academyId,
    studentId,
    status: { $in: FINAL_ATTEMPT_STATUSES }
  })
    .select('assessmentId courseId answers submittedAt createdAt')
    .sort({ submittedAt: -1, createdAt: -1 })
    .limit(150);

  const seen = new Set();
  return rows.filter(row => {
    const key = String(row.assessmentId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function gapRowsFromAttempts(academyId, attempts) {
  if (!attempts.length) return [];

  const assessmentIds = uniq(attempts.map(row => row.assessmentId));
  const questions = await QuizQuestion.find({
    academyId,
    assessmentId: { $in: assessmentIds },
    lessonId: { $ne: null }
  }).select('_id assessmentId courseId lessonId marks');

  const questionMap = new Map(
    questions.map(question => [String(question._id), question])
  );

  const stats = new Map();

  for (const attempt of attempts) {
    for (const answer of attempt.answers || []) {
      const question = questionMap.get(String(answer.questionId));
      if (!question || answer.isCorrect === null || answer.isCorrect === undefined) continue;

      const key = String(question.lessonId);
      if (!stats.has(key)) {
        stats.set(key, {
          lessonId: question.lessonId,
          courseId: question.courseId,
          answered: 0,
          wrong: 0
        });
      }

      const row = stats.get(key);
      row.answered += 1;
      if (answer.isCorrect === false) row.wrong += 1;
    }
  }

  if (!stats.size) return [];

  const lessonIds = [...stats.values()].map(row => row.lessonId);
  const lessons = await Lesson.find({
    academyId,
    _id: { $in: lessonIds }
  })
    .select('_id courseId title order')
    .populate('courseId', 'title code');

  const lessonMap = new Map(lessons.map(row => [String(row._id), row]));

  return [...stats.values()]
    .map(row => {
      const lesson = lessonMap.get(String(row.lessonId));
      if (!lesson || !row.answered) return null;
      return {
        lesson: {
          id: String(lesson._id),
          title: lesson.title,
          order: lesson.order,
          course: lesson.courseId
            ? {
                id: String(lesson.courseId._id || lesson.courseId),
                title: lesson.courseId.title || '',
                code: lesson.courseId.code || ''
              }
            : null
        },
        wrong: row.wrong,
        answered: row.answered,
        errorRate: Math.round((row.wrong / row.answered) * 100)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.errorRate - a.errorRate || b.wrong - a.wrong)
    .slice(0, 10);
}

async function studentGapMap(academyId, studentId) {
  const featureSettings = await getSettings(academyId);
  if (!featureSettings.gapMapEnabled) return [];
  const attempts = await latestAttemptsForStudent(academyId, studentId);
  return gapRowsFromAttempts(academyId, attempts);
}

async function pendingFeedbackSessions(academyId, studentId) {
  const cutoff = new Date(Date.now() - FEEDBACK_LOOKBACK_DAYS * 86400000);

  const attendance = await LiveAttendance.find({
    academyId,
    studentId,
    verifiedByZoom: true,
    attendanceStatus: { $in: ['present','late'] },
    lastEventAt: { $gte: cutoff }
  })
    .populate({
      path: 'liveSessionId',
      match: { status: 'ended' },
      select: 'title startAt courseId',
      populate: { path: 'courseId', select: 'title code' }
    })
    .sort({ lastEventAt: -1 })
    .limit(20);

  const sessions = attendance.map(row => row.liveSessionId).filter(Boolean);
  if (!sessions.length) return [];

  const existing = await SessionFeedback.find({
    academyId,
    studentId,
    liveSessionId: { $in: sessions.map(row => row._id) }
  }).select('liveSessionId');

  const rated = new Set(existing.map(row => String(row.liveSessionId)));

  return sessions
    .filter(session => !rated.has(String(session._id)))
    .slice(0, 5)
    .map(session => ({
      id: String(session._id),
      title: session.title,
      startAt: session.startAt,
      course: session.courseId
        ? {
            id: String(session.courseId._id || session.courseId),
            title: session.courseId.title || '',
            code: session.courseId.code || ''
          }
        : null
    }));
}

async function studentOverview(req) {
  const featureSettings = await getSettings(req.academyId);
  const [compensations, gaps, feedbackSessions] = await Promise.all([
    featureSettings.compensationEnabled
      ? syncStudentCompensations(req.academyId, req.user.sub)
      : [],
    featureSettings.gapMapEnabled
      ? studentGapMap(req.academyId, req.user.sub)
      : [],
    pendingFeedbackSessions(req.academyId, req.user.sub)
  ]);

  return {
    settings: featureSettings,
    compensations: compensations.map(serializeCompensation).filter(Boolean),
    gaps,
    feedbackSessions
  };
}

async function submitSessionFeedback(req, body = {}) {
  const rating = String(body.rating || '');
  if (!['understood','partial','lost'].includes(rating)) {
    const err = new Error('اختر تقييم الحصة');
    err.status = 400;
    throw err;
  }

  const liveSessionId = String(body.liveSessionId || '');
  const session = await LiveSession.findOne({
    _id: liveSessionId,
    academyId: req.academyId,
    status: 'ended'
  }).select('_id courseId groupId title');

  if (!session) {
    const err = new Error('الحصة غير متاحة للتقييم');
    err.status = 404;
    throw err;
  }

  const attendance = await LiveAttendance.findOne({
    academyId: req.academyId,
    liveSessionId: session._id,
    studentId: req.user.sub,
    verifiedByZoom: true,
    attendanceStatus: { $in: ['present','late'] }
  });

  if (!attendance) {
    const err = new Error('التقييم متاح للطلاب الذين حضروا الحصة عبر Zoom');
    err.status = 403;
    throw err;
  }

  const row = await SessionFeedback.findOneAndUpdate(
    {
      academyId: req.academyId,
      liveSessionId: session._id,
      studentId: req.user.sub
    },
    {
      $set: {
        courseId: session.courseId,
        groupId: session.groupId || null,
        rating,
        hardestPoint: clean(body.hardestPoint, 1200)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    id: String(row._id),
    rating: row.rating,
    hardestPoint: row.hardestPoint
  };
}

async function instructorInsights(req) {
  const scope = await instructorScope(req);
  const courseIds = uniq(scope.contentCourseIds);

  const sessionOr = [];
  if (scope.directCourseIds.length) {
    sessionOr.push({ courseId: { $in: scope.directCourseIds } });
  }
  if (scope.assignedGroupIds.length) {
    sessionOr.push({ groupId: { $in: scope.assignedGroupIds } });
  }

  const cutoff = new Date(Date.now() - 45 * 86400000);
  const sessions = sessionOr.length
    ? await LiveSession.find({
        academyId: req.academyId,
        status: 'ended',
        startAt: { $gte: cutoff },
        $or: sessionOr
      })
        .select('_id title startAt courseId')
        .populate('courseId', 'title code')
        .sort({ startAt: -1 })
        .limit(12)
    : [];

  const feedbackRows = sessions.length
    ? await SessionFeedback.find({
        academyId: req.academyId,
        liveSessionId: { $in: sessions.map(row => row._id) }
      }).select('liveSessionId rating hardestPoint')
    : [];

  const feedbackBySession = new Map();
  for (const row of feedbackRows) {
    const key = String(row.liveSessionId);
    if (!feedbackBySession.has(key)) {
      feedbackBySession.set(key, {
        understood: 0,
        partial: 0,
        lost: 0,
        hardestPoints: []
      });
    }
    const item = feedbackBySession.get(key);
    item[row.rating] += 1;
    if (row.hardestPoint) item.hardestPoints.push(row.hardestPoint);
  }

  let gaps = [];
  const featureSettings = await getSettings(req.academyId);

  if (featureSettings.gapMapEnabled && courseIds.length) {
    const attemptFilter = await studentCourseAccessFilter(req, {
      status: { $in: FINAL_ATTEMPT_STATUSES }
    });

    const attempts = await QuizAttempt.find(attemptFilter)
      .select('assessmentId courseId studentId answers submittedAt createdAt')
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(800);

    const seen = new Set();
    const latest = attempts.filter(row => {
      const key = `${row.studentId}:${row.assessmentId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    gaps = await gapRowsFromAttempts(req.academyId, latest);
  }

  return {
    settings: featureSettings,
    feedback: sessions.map(session => {
      const stats = feedbackBySession.get(String(session._id)) || {
        understood: 0,
        partial: 0,
        lost: 0,
        hardestPoints: []
      };
      const total = stats.understood + stats.partial + stats.lost;
      return {
        session: {
          id: String(session._id),
          title: session.title,
          startAt: session.startAt,
          course: session.courseId
        },
        total,
        understood: stats.understood,
        partial: stats.partial,
        lost: stats.lost,
        hardestPoints: stats.hardestPoints.slice(0, 6)
      };
    }),
    gaps
  };
}

function whatsappDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function riskLevel(score) {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

async function withdrawalRisk(req) {
  const academyId = req.academyId;
  const now = new Date();
  const sessionCutoff = new Date(Date.now() - RISK_LOOKBACK_DAYS * 86400000);
  const paymentFallbackCutoff = new Date(
    Date.now() - PAYMENT_FALLBACK_OVERDUE_DAYS * 86400000
  );

  const academy = await Academy.findById(academyId).select('name');
  const enrollments = await Enrollment.find({
    academyId,
    status: { $in: ['active','paused'] }
  }).select('studentId courseId groupId');

  const studentIds = uniq(enrollments.map(row => row.studentId));
  const courseIds = uniq(enrollments.map(row => row.courseId));

  if (!studentIds.length) return [];

  const [students, sessions, attendanceRows, assignments, submissions, pendingPayments] =
    await Promise.all([
      User.find({
        _id: { $in: studentIds },
        academyId,
        role: 'student',
        active: true
      }).select('name email phone'),
      LiveSession.find({
        academyId,
        courseId: { $in: courseIds },
        status: 'ended',
        startAt: { $gte: sessionCutoff }
      }).select('_id courseId groupId startAt'),
      LiveAttendance.find({
        academyId,
        studentId: { $in: studentIds }
      }).select('studentId liveSessionId attendanceStatus verifiedByZoom manualOverride'),
      Assessment.find({
        academyId,
        courseId: { $in: courseIds },
        type: 'assignment',
        status: { $in: ['published','closed'] },
        dueAt: { $ne: null, $lt: now }
      }).select('_id courseId dueAt'),
      AssignmentSubmission.find({
        academyId,
        studentId: { $in: studentIds }
      }).select('studentId assessmentId'),
      Payment.find({
        academyId,
        studentId: { $in: studentIds },
        status: 'pending',
        createdAt: { $lt: paymentFallbackCutoff }
      }).select('studentId amount currency createdAt')
    ]);

  const enrollmentsByStudent = new Map();
  for (const enrollment of enrollments) {
    const key = String(enrollment.studentId);
    if (!enrollmentsByStudent.has(key)) enrollmentsByStudent.set(key, []);
    enrollmentsByStudent.get(key).push(enrollment);
  }

  const attendanceMap = new Map(
    attendanceRows.map(row => [
      `${row.studentId}:${row.liveSessionId}`,
      row
    ])
  );

  const submitted = new Set(
    submissions.map(row => `${row.studentId}:${row.assessmentId}`)
  );

  const paymentsByStudent = new Map();
  for (const payment of pendingPayments) {
    const key = String(payment.studentId);
    if (!paymentsByStudent.has(key)) paymentsByStudent.set(key, []);
    paymentsByStudent.get(key).push(payment);
  }

  const rows = [];

  for (const student of students) {
    const sid = String(student._id);
    const studentEnrollments = enrollmentsByStudent.get(sid) || [];
    const courseSet = new Set(studentEnrollments.map(row => String(row.courseId)));

    const applicableSessions = sessions.filter(session => {
      if (!courseSet.has(String(session.courseId))) return false;
      return studentEnrollments.some(enrollment =>
        sessionMatchesEnrollment(session, enrollment)
      );
    });

    let missedSessions = 0;
    for (const session of applicableSessions) {
      const attendance = attendanceMap.get(`${sid}:${session._id}`);
      if (!attendanceCoversSession(attendance)) missedSessions += 1;
    }

    const absenceRate = applicableSessions.length
      ? missedSessions / applicableSessions.length
      : 0;

    const overdueAssignments = assignments.filter(assignment => {
      if (!courseSet.has(String(assignment.courseId))) return false;
      return !submitted.has(`${sid}:${assignment._id}`);
    }).length;

    const overduePayments = (paymentsByStudent.get(sid) || []).length;

    const attendancePoints = Math.min(50, Math.round(absenceRate * 50));
    const assignmentPoints = Math.min(30, overdueAssignments * 10);
    const paymentPoints = Math.min(20, overduePayments * 10);
    const score = Math.min(100, attendancePoints + assignmentPoints + paymentPoints);

    const reasons = [];
    if (missedSessions) {
      reasons.push(`غياب ${missedSessions} من ${applicableSessions.length} حصة خلال آخر ${RISK_LOOKBACK_DAYS} يومًا`);
    }
    if (overdueAssignments) {
      reasons.push(`${overdueAssignments} واجب متأخر بدون تسليم`);
    }
    if (overduePayments) {
      reasons.push(`${overduePayments} دفعة معلقة منذ أكثر من ${PAYMENT_FALLBACK_OVERDUE_DAYS} أيام`);
    }
    if (!reasons.length) reasons.push('لا توجد مؤشرات خطر واضحة حاليًا');

    const message = [
      `مرحباً ${student.name}،`,
      `نود الاطمئنان على تقدمك في ${academy?.name || 'الأكاديمية'}.`,
      score > 0
        ? `لاحظنا: ${reasons.join('، ')}.`
        : 'وضعك الدراسي مستقر حالياً.',
      'إذا واجهتك أي صعوبة أو تحتاج مساعدة، تواصل معنا وسنساعدك في ترتيب الخطوات القادمة.'
    ].join(' ');

    const digits = whatsappDigits(student.phone);

    rows.push({
      student: {
        id: sid,
        name: student.name,
        email: student.email,
        phone: student.phone || ''
      },
      score,
      level: riskLevel(score),
      reasons,
      metrics: {
        missedSessions,
        totalSessions: applicableSessions.length,
        absenceRate: Math.round(absenceRate * 100),
        overdueAssignments,
        overduePayments
      },
      whatsappMessage: message,
      whatsappUrl: digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
        : ''
    });
  }

  return rows.sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name, 'ar'));
}

async function assertQuizAccess(req, quizId) {
  const quiz = await Assessment.findOne({
    _id: quizId,
    academyId: req.academyId,
    type: 'quiz'
  }).select('_id courseId title');

  if (!quiz) {
    const err = new Error('الاختبار غير موجود');
    err.status = 404;
    throw err;
  }

  if (req.user.role === 'instructor') {
    await assertInstructorCourse(req, quiz.courseId);
  } else if (!['owner','admin','content_manager'].includes(req.user.role)) {
    const err = new Error('غير مصرح لك بإدارة ربط الأسئلة بالدروس');
    err.status = 403;
    throw err;
  }

  return quiz;
}

async function quizLessonMapping(req, quizId) {
  const featureSettings = await getSettings(req.academyId);
  const quiz = await assertQuizAccess(req, quizId);

  const [lessons, questions] = await Promise.all([
    Lesson.find({
      academyId: req.academyId,
      courseId: quiz.courseId
    }).select('_id title order status').sort({ order: 1, createdAt: 1 }),
    QuizQuestion.find({
      academyId: req.academyId,
      assessmentId: quiz._id
    }).select('_id prompt order lessonId').sort({ order: 1, createdAt: 1 })
  ]);

  return {
    enabled: featureSettings.gapMapEnabled,
    quiz: { id: String(quiz._id), title: quiz.title },
    lessons: lessons.map(row => ({
      id: String(row._id),
      title: row.title,
      order: row.order,
      status: row.status
    })),
    questions: questions.map(row => ({
      id: String(row._id),
      prompt: row.prompt,
      order: row.order,
      lessonId: row.lessonId ? String(row.lessonId) : ''
    }))
  };
}

async function updateQuestionLesson(req, quizId, questionId, lessonId) {
  const featureSettings = await getSettings(req.academyId);
  if (!featureSettings.gapMapEnabled) {
    const err = new Error('ميزة خريطة الفجوات غير مفعلة من الإعدادات');
    err.status = 409;
    throw err;
  }

  const quiz = await assertQuizAccess(req, quizId);
  const lesson = await Lesson.findOne({
    _id: lessonId,
    academyId: req.academyId,
    courseId: quiz.courseId
  }).select('_id');

  if (!lesson) {
    const err = new Error('الدرس المحدد لا يتبع دورة هذا الاختبار');
    err.status = 400;
    throw err;
  }

  const question = await QuizQuestion.findOneAndUpdate(
    {
      _id: questionId,
      academyId: req.academyId,
      assessmentId: quiz._id,
      courseId: quiz.courseId
    },
    { $set: { lessonId: lesson._id } },
    { new: true }
  ).select('_id lessonId');

  if (!question) {
    const err = new Error('السؤال غير موجود');
    err.status = 404;
    throw err;
  }

  return {
    questionId: String(question._id),
    lessonId: String(question.lessonId)
  };
}

module.exports = {
  getSettings,
  updateSettings,
  studentOverview,
  submitCompensation,
  submitSessionFeedback,
  instructorInsights,
  withdrawalRisk,
  quizLessonMapping,
  updateQuestionLesson,
  ensureSessionCompensations
};
