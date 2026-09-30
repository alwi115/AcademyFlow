const User = require('../models/User');
const Notification = require('../models/Notification');
const Delivery = require('../models/NotificationDelivery');
const mailer = require('./mailer.service');
let timer, running = false;
function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID || '') &&
    /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') && process.env.WHATSAPP_TEMPLATE_NAME);
}
function assertChannel(channel) {
  if (!['in_app', 'email', 'whatsapp'].includes(channel)) throw Object.assign(new Error('Invalid notification channel'), { status: 400 });
  if ((channel === 'email' && !mailer.configured()) || (channel === 'whatsapp' && !whatsappConfigured())) {
    throw Object.assign(new Error('Notification provider is not configured'), { status: 503 });
  }
}
async function enqueue(notification) {
  const query = { academyId: notification.academyId, active: true };
  if (notification.audience === 'students') query.role = 'student';
  if (notification.audience === 'instructors') query.role = 'instructor';
  if (notification.audience === 'staff') query.role = { $nin: ['student', 'instructor'] };
  query[`notificationPreferences.${notification.channel}`] = notification.channel === 'email' ? { $ne: false } : true;
  for await (const user of User.find(query).select('_id').cursor()) {
    await Delivery.updateOne({ notificationId: notification._id, userId: user._id }, { $setOnInsert: { status: 'staged', retryAt: new Date(), attempts: 0 } }, { upsert: true });
  }
  await Notification.updateOne({ _id: notification._id }, { $set: { queueReady: true } });
  await Delivery.updateMany({ notificationId: notification._id, status: 'staged' }, { $set: { status: 'queued' } });
}
async function sendWhatsapp(user, notification) {
  const phone = String(user.phone || '').replace(/[\s+-]/g, '');
  if (!/^\d{8,15}$/.test(phone)) throw Object.assign(new Error('Invalid WhatsApp phone'), { code: 'INVALID_PHONE' });
  const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: notification.title }, { type: 'text', text: notification.message }] }]
    } })
  });
  if (!response.ok) throw Object.assign(new Error('WhatsApp request failed'), { code: `WHATSAPP_HTTP_${response.status}` });
}
async function runOnce() {
  if (running || await require('./backup.service').restoreInProgress()) return;
  running = true;
  try {
    const unqueued = await Notification.find({ status: 'pending', queueReady: false }).limit(10);
    for (const notification of unqueued) await enqueue(notification);
    for (let i = 0; i < 25; i++) {
      const now = new Date();
      const row = await Delivery.findOneAndUpdate({ attempts: { $lt: 3 }, $or: [
        { status: 'queued', retryAt: { $lte: now } }, { status: 'processing', leaseUntil: { $lt: now } }
      ] }, { $set: { status: 'processing', leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { new: true });
      if (!row) break;
      const notification = await Notification.findById(row.notificationId);
      const user = notification && await User.findOne({ _id: row.userId, academyId: notification.academyId, active: true });
      try {
        if (!notification || !user || (notification.channel === 'email' ? user.notificationPreferences?.email === false : user.notificationPreferences?.whatsapp !== true)) row.status = 'skipped';
        else {
          if (notification.channel === 'email') await mailer.sendNotification({ to: user.email, title: notification.title, message: notification.message });
          else await sendWhatsapp(user, notification);
          row.status = 'sent'; row.sentAt = new Date();
        }
      } catch (err) {
        row.status = row.attempts >= 3 ? 'failed' : 'queued';
        row.errorCode = String(err.code || err.name || 'DELIVERY_FAILED').slice(0, 100);
        row.retryAt = new Date(Date.now() + row.attempts * 60000);
      }
      await row.save();
      const pending = await Delivery.exists({ notificationId: row.notificationId, status: { $in: ['staged', 'queued', 'processing'] } });
      if (!pending && notification) {
        const failed = await Delivery.exists({ notificationId: row.notificationId, status: 'failed' });
        notification.status = failed ? 'failed' : 'sent';
        notification.sentAt = failed ? null : new Date();
        await notification.save();
      }
    }
  } finally { running = false; }
}
function start() {
  if (!timer) { timer = setInterval(() => runOnce().catch(err => console.error('[notification-delivery]', err.message)), 10000); timer.unref(); }
}
module.exports = { assertChannel, enqueue, runOnce, start, whatsappConfigured };
