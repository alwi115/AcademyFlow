const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true, trim: true },
  category: { type: String, enum: ['technical','billing','account','feature','other'], default: 'technical' },
  priority: { type: String, enum: ['low','normal','high'], default: 'normal' },
  message: { type: String, required: true },
  status: { type: String, enum: ['open','in_progress','closed'], default: 'open' }
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
