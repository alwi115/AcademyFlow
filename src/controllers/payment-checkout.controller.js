const Stripe = require('stripe');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { objectId } = require('../utils/security-input');
function client({ checkout = false } = {}) {
  if ((checkout && process.env.PAYMENTS_ENABLED !== 'true') || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw Object.assign(new Error('Online payments are not configured'), { status: 503 });
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 2 });
}
function amountInMinorUnits(payment) {
  const currency = String(payment.currency).toLowerCase();
  const allowed = String(process.env.STRIPE_CURRENCIES || 'usd,eur,gbp,aed').split(',');
  if (!allowed.includes(currency)) throw Object.assign(new Error('This currency is not enabled for online payment; no currency conversion is performed'), { status: 400 });
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const amount = Math.round(payment.amount * 10 ** digits);
  if (!Number.isSafeInteger(amount) || amount <= 0 || Math.abs(amount / 10 ** digits - payment.amount) > 0.0000001) {
    throw Object.assign(new Error('Invalid payment amount'), { status: 400 });
  }
  return amount;
}
async function checkout(req, res) {
  const stripe = client({ checkout: true });
  const payment = await Payment.findOne({ _id: objectId(req.params.id), academyId: req.academyId, studentId: req.user.sub, status: 'pending' });
  if (!payment) return res.status(404).json({ message: 'Pending payment not found' });
  const base = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  if (!/^https:\/\//.test(base) && process.env.NODE_ENV === 'production') throw Object.assign(new Error('PUBLIC_URL must use HTTPS'), { status: 503 });
  if (!/^https?:\/\//.test(base)) throw Object.assign(new Error('PUBLIC_URL is required'), { status: 503 });
  const student = await User.findById(req.user.sub).select('email');
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', customer_email: student.email, client_reference_id: String(payment._id),
    success_url: base + '/student/payments.html?checkout=success', cancel_url: base + '/student/payments.html?checkout=cancelled',
    metadata: { paymentId: String(payment._id), academyId: String(payment.academyId) },
    line_items: [{ quantity: 1, price_data: { currency: payment.currency.toLowerCase(), unit_amount: amountInMinorUnits(payment), product_data: { name: 'Academy course payment' } } }]
  }, { idempotencyKey: 'academyflow-payment-' + payment._id });
  if (session.status === 'expired') return res.status(409).json({ message: 'Checkout expired; contact the academy to reissue this payment' });
  await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { stripeCheckoutId: session.id } });
  res.json({ url: session.url });
}
async function webhook(req, res) {
  let event;
  try { event = client().webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return res.status(err.status === 503 ? 503 : 400).json({ message: 'Invalid payment webhook or provider unavailable' }); }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) return res.json({ ok: true });
  const data = event.data.object;
  const payment = await Payment.findOne({ stripeCheckoutId: data.id, status: 'pending' });
  if (!payment) return res.json({ ok: true });
  if (data.metadata?.paymentId !== String(payment._id) || data.metadata?.academyId !== String(payment.academyId) ||
      data.amount_total !== amountInMinorUnits(payment) || data.currency !== payment.currency.toLowerCase()) {
    return res.status(400).json({ message: 'Payment details do not match' });
  }
  const paid = data.payment_status === 'paid';
  if (paid) {
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'paid', method: 'card', paidAt: new Date(), stripePaymentIntentId: String(data.payment_intent || ''), reference: data.id } });
  } else if (event.type === 'checkout.session.async_payment_failed') {
    await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed' } });
  }
  res.json({ ok: true });
}
module.exports = { checkout, webhook, amountInMinorUnits };
