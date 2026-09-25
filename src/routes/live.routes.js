const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/live.controller');
router.use(auth, tenant);
router.get('/', c.listLiveSessions);
router.post('/', allowRoles('owner','admin','instructor'), c.createLiveSession);
module.exports = router;
