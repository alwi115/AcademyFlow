const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }
});
module.exports = mongoose.model('RevokedSession', schema);
