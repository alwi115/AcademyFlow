const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/zoom.controller');

// Zoom redirects here from another site, so this callback must not require
// the AcademyFlow Strict session cookie. Security is enforced with signed
// state + a short-lived SameSite=Lax state cookie + a DB nonce.
router.get('/callback', c.callback);

router.get('/status', auth, tenant, allowRoles('owner','admin'), c.status);
router.post('/connect', auth, tenant, allowRoles('owner'), c.connect);
router.post('/disconnect', auth, tenant, allowRoles('owner'), c.disconnect);

module.exports = router;
