const mongoose = require('mongoose');
const Academy = require('../models/Academy');
const Plan = require('../models/Plan');
function academyAccess(academy, now = Date.now()) {
  if (!academy || ['frozen', 'suspended'].includes(academy.status)) return false;
  const field = { trial: 'trialEndsAt', grace: 'graceEndsAt', active: 'subscriptionEndsAt' }[academy.status];
  return !field || !academy[field] || new Date(academy[field]).getTime() > now;
}
async function withQuota(academyId, resource, Model, action, excludedId) {
  if (!resource) return action(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      // Serialize quota-changing requests for this tenant; retries see the new count.
      const academy = await Academy.findOneAndUpdate({ _id: academyId }, { $inc: { quotaRevision: 1 } }, { new: true, session });
      if (!academyAccess(academy)) throw Object.assign(new Error('Subscription expired or academy unavailable'), { status: 403 });
      const plan = academy.planId ? await Plan.findById(academy.planId).session(session) : null;
      if (academy.planId && !plan) throw Object.assign(new Error('Assigned plan is unavailable'), { status: 503 });
      const limit = plan?.limits?.[resource];
      if (limit !== undefined && limit !== null) {
        const filter = { academyId };
        if (resource === 'students') filter.role = 'student';
        if (resource === 'instructors') filter.role = 'instructor';
        if (excludedId) filter._id = { $ne: excludedId };
        if (await Model.countDocuments(filter).session(session) >= limit) {
          throw Object.assign(new Error(`Plan limit reached: ${resource}`), { status: 409 });
        }
      }
      result = await action(session);
    });
    return result;
  } finally { await session.endSession(); }
}
async function createWithQuota(academyId, resource, Model, data) {
  return withQuota(academyId, resource, Model, async session => session
    ? (await Model.create([data], { session }))[0] : Model.create(data));
}
module.exports = { academyAccess, withQuota, createWithQuota };
