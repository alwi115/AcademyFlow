function tenant(req, res, next) {
  if (req.user?.role === 'superadmin') return next();
  if (!req.user?.academyId) return res.status(403).json({ message: 'Academy context missing' });
  req.academyId = req.user.academyId;
  next();
}

module.exports = tenant;
