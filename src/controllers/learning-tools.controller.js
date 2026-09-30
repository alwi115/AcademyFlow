const service = require('../services/learning-tools.service');
exports.calendar = async (req, res) => res.json(await service.calendar(req));
exports.progress = async (req, res) => res.json(await service.progress(req));
exports.followUp = async (req, res) => res.json(await service.followUp(req));
