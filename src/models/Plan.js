const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, required: true, uppercase: true },
  monthlyPrice: { type: Number, default: 0 },
  yearlyPrice: { type: Number, default: 0 },
  limits: {
    students: { type: Number, default: 100 },
    instructors: { type: Number, default: 3 },
    courses: { type: Number, default: 10 },
    branches: { type: Number, default: 1 }
  },
  features: [String],
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Plan', PlanSchema);
