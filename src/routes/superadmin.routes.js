const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const c = require('../controllers/superadmin.controller');

router.use(auth, allowRoles('superadmin'));

router.get('/stats', c.stats);

router.get('/academies', c.listAcademies);
router.post('/academies', c.createAcademy);
router.patch('/academies/:id', c.updateAcademy);
router.patch('/academies/:id/status', c.updateStatus);
router.patch('/academies/:id/subscription', c.updateSubscription);

router.get('/plans', c.listPlans);
router.post('/plans', c.createPlan);
router.patch('/plans/:id', c.updatePlan);
router.patch('/plans/:id/toggle', c.togglePlan);

router.get('/subscriptions', c.subscriptions);
router.get('/health', c.health);
router.get('/audit', c.listAudit);

router.get('/settings', c.getSettings);
router.patch('/settings', c.updateSettings);

module.exports = router;
