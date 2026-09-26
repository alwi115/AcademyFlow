const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/live.controller');

router.use(auth, tenant, allowRoles('owner','admin'));

router.get('/', c.listLiveSessions);
router.get('/series', c.listLiveSeries);
router.post('/series', c.createLiveSeries);
router.patch('/series/:seriesId/cancel-future', c.cancelLiveSeriesFuture);
router.post('/', c.createLiveSession);
router.patch('/:id', c.updateLiveSession);

module.exports = router;
