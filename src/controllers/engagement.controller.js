const engagement = require('../services/engagement.service');

async function settings(req, res) {
  res.json(await engagement.getSettings(req.academyId));
}

async function updateSettings(req, res) {
  res.json(await engagement.updateSettings(req.academyId, req.body || {}));
}

async function studentOverview(req, res) {
  res.json(await engagement.studentOverview(req));
}

async function submitCompensation(req, res) {
  res.json(await engagement.submitCompensation(
    req,
    req.params.progressId,
    req.body?.answers
  ));
}

async function sessionFeedback(req, res) {
  res.status(201).json(await engagement.submitSessionFeedback(req, req.body || {}));
}

async function instructorInsights(req, res) {
  res.json(await engagement.instructorInsights(req));
}

async function withdrawalRisk(req, res) {
  res.json(await engagement.withdrawalRisk(req));
}

async function quizMapping(req, res) {
  res.json(await engagement.quizLessonMapping(req, req.params.quizId));
}

async function updateQuestionLesson(req, res) {
  res.json(await engagement.updateQuestionLesson(
    req,
    req.params.quizId,
    req.params.questionId,
    req.body?.lessonId
  ));
}

module.exports = {
  settings,
  updateSettings,
  studentOverview,
  submitCompensation,
  sessionFeedback,
  instructorInsights,
  withdrawalRisk,
  quizMapping,
  updateQuestionLesson
};
