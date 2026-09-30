require('dotenv').config();
const mongoose = require('mongoose');
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  try {
    const db = mongoose.connection.db;
    const hello = await db.command({ hello: 1 });
    const attendance = await db.collection('attendances').aggregate([
      { $group: { _id: { academyId: '$academyId', studentId: '$studentId', courseId: '$courseId', groupId: { $ifNull: ['$groupId', null] },
        day: { $dateTrunc: { date: '$date', unit: 'day', timezone: 'UTC' } } }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 20 }
    ]).toArray();
    let indexes = [];
    try { indexes = await db.collection('courses').indexes(); } catch (err) { if (err.code !== 26) throw err; }
    const legacyCourseIndexes = indexes.filter(row => row.key?.academyId === 1 && row.key?.code === 1 && row.sparse);
    console.log(JSON.stringify({ readOnly: true, replicaSetOrSharded: Boolean(hello.setName || hello.msg === 'isdbgrid'),
      attendanceDuplicates: attendance, legacyCourseIndexes,
      note: 'Review and back up before any explicit index/data migration. This script changes no data.' }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
