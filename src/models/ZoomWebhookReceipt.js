const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  status: { type: String, enum: ['processing', 'done'], required: true },
  expiresAt: { type: Date, expires: 0 }
});
module.exports = mongoose.model('ZoomWebhookReceipt', schema);
