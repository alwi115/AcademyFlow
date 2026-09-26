const bcrypt = require('bcryptjs');
const User = require('../models/User');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

async function bootstrapSuperAdmin(options = {}) {
  const resetPassword = Boolean(options.resetPassword);
  const username = normalizeUsername(process.env.SUPERADMIN_USERNAME);
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || '';
  const name = String(process.env.SUPERADMIN_NAME || 'AcademyFlow Owner').trim();

  if (!username || !email || !password) {
    console.warn('[bootstrap] SUPERADMIN_USERNAME, SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD is missing; Super Admin bootstrap skipped.');
    return { created: false, reason: 'missing_env' };
  }

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new Error('SUPERADMIN_USERNAME must be 3-40 characters using letters, numbers, dot, underscore or dash only');
  }

  if (password.length < 12) {
    throw new Error('SUPERADMIN_PASSWORD must be at least 12 characters');
  }

  const usernameOwner = await User.findOne({
    academyId: null,
    username
  });

  if (usernameOwner && usernameOwner.role !== 'superadmin') {
    throw new Error('SUPERADMIN_USERNAME is already used by another system user');
  }

  const existingSuperAdmin = await User.findOne({
    academyId: null,
    role: 'superadmin'
  });

  if (existingSuperAdmin) {
    let changed = false;

    if (existingSuperAdmin.username !== username) {
      existingSuperAdmin.username = username;
      changed = true;
    }

    if (existingSuperAdmin.email !== email) {
      existingSuperAdmin.email = email;
      changed = true;
    }

    if (resetPassword) {
      existingSuperAdmin.passwordHash = await bcrypt.hash(password, 12);
      existingSuperAdmin.active = true;
      changed = true;
    }

    if (changed) {
      await existingSuperAdmin.save();
      console.log(`Super Admin account synchronized: ${username}`);
    } else {
      console.log(`Super Admin already exists: ${username}`);
    }

    return {
      created: false,
      reason: 'already_exists',
      passwordSynchronized: resetPassword
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await User.create({
      academyId: null,
      name,
      username,
      email,
      passwordHash,
      role: 'superadmin',
      active: true
    });

    console.log(`Super Admin created: ${username}`);
    return { created: true, userId: user._id.toString() };
  } catch (err) {
    if (err && err.code === 11000) {
      console.warn('[bootstrap] Super Admin was created by another instance; continuing normally.');
      return { created: false, reason: 'race_duplicate' };
    }
    throw err;
  }
}

module.exports = bootstrapSuperAdmin;
