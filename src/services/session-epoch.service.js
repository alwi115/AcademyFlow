const mongoose = require('mongoose');
const COLLECTION = 'academyflow_auth_state';
async function currentEpoch() {
  const state = await mongoose.connection.db.collection(COLLECTION).findOne({ _id: 'sessions' });
  return String(state?.epoch || '');
}
module.exports = { COLLECTION, currentEpoch };
