const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/live.controller');

router.use(auth, tenant);
router.get('/', allowRoles('owner','admin','instructor','branch_manager','content_manager'), c.listLiveSessions);
router.get('/series', allowRoles('owner','admin'), c.listLiveSeries);
router.post('/series', allowRoles('owner','admin'), c.createLiveSeries);
router.patch('/series/:seriesId/cancel-future', allowRoles('owner','admin'), c.cancelLiveSeriesFuture);
router.post('/', allowRoles('owner','admin','instructor'), c.createLiveSession);
router.patch('/:id', allowRoles('owner','admin','instructor'), c.updateLiveSession);

module.exports = router;
