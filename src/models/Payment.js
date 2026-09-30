const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'OMR' },
  method: { type: String, enum: ['cash','card','bank'], default: 'cash' },
  status: { type: String, enum: ['pending','paid','refunded','failed'], default: 'paid' },
  reference: String,
  stripeCheckoutId: { type: String, unique: true, sparse: true },
  stripePaymentIntentId: String,
  paidAt: { type: Date, default: Date.now },
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
