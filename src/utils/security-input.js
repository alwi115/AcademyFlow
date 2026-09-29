const mongoose = require('mongoose');

function badRequest(message) {
  const err = new Error(message || 'Invalid request value');
  err.status = 400;
  return err;
}

function objectId(value, label = 'المعرف غير صحيح') {
  if (value instanceof mongoose.Types.ObjectId) return value;

  if (typeof value !== 'string') {
    throw badRequest(label);
  }

  const normalized = value.trim();
  if (!/^[a-fA-F0-9]{24}$/.test(normalized)) {
    throw badRequest(label);
  }

  return mongoose.Types.ObjectId.createFromHexString(normalized);
}

function optionalObjectId(value, label = 'المعرف غير صحيح') {
  if (value === undefined || value === null || value === '') return null;
  return objectId(value, label);
}

function enumValue(value, allowed, label = 'القيمة غير صحيحة') {
  for (const candidate of allowed) {
    if (value === candidate) return candidate;
  }
  throw badRequest(label);
}

module.exports = {
  objectId,
  optionalObjectId,
  enumValue
};
