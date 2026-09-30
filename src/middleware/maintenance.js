const SystemSetting = require('../models/SystemSetting');
async function maintenance(req, res, next) {
  try {
    if (req.originalUrl?.split('?')[0] === '/api/auth/logout' || req.user?.role === 'superadmin' || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const settings = await SystemSetting.findOne({ key: 'platform' }).select('maintenanceMode').lean();
    if (settings?.maintenanceMode) {
      res.set('Retry-After', '60');
      return res.status(503).json({ message: 'Platform maintenance is in progress' });
    }
    next();
  } catch (err) { next(err); }
}
module.exports = maintenance;
