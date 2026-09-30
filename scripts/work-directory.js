const os = require('os');
const path = require('path');
module.exports = path.resolve(process.env.ACADEMYFLOW_WORK_DIR || path.join(os.tmpdir(), 'academyflow-work'));
