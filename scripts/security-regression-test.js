const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'academyflow-security-'));
  process.env.CERTIFICATE_STORAGE_DIR = root;
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = crypto.randomBytes(32).toString('hex');
  process.env.ZOOM_CLIENT_ID = 'test-client';
  const storage = require('../src/services/certificate-storage.service');
  const { objectId, enumValue } = require('../src/utils/security-input');
  const Academy = require('../src/models/Academy');
  const webhook = require('../src/controllers/zoom-webhook.controller');
  const originalFind = Academy.find;
  let deauthorizationLookups = 0;
  Academy.find = () => {
    deauthorizationLookups++;
    return { select: async () => [] };
  };
  const invoke = async (body, options = {}) => {
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const raw = JSON.stringify(body);
    const signature = 'v0=' + crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
      .update(`v0:${timestamp}:${options.signedRaw ?? raw}`).digest('hex');
    const req = { body: Buffer.from(raw), headers: {
      'x-zm-request-timestamp': timestamp,
      'x-zm-signature': options.unsigned ? '' : signature
    } };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await webhook.handle(req, res);
    return res;
  };
  try {
    const id = '0123456789abcdef01234567';
    assert.equal(String(objectId(id)), id);
    for (const value of [{ $ne: null }, [id], null, '', 'x'.repeat(24), '../etc/passwd']) {
      assert.throws(() => objectId(value), error => error.status === 400);
    }
    assert.equal(enumValue('active', ['active', 'paused']), 'active');
    assert.throws(() => enumValue({ $ne: '' }, ['active', 'paused']));

    for (const buffer of [null, { type: 'Buffer', data: [37, 80, 68, 70, 45] }, Buffer.from('not pdf')]) {
      await assert.rejects(storage.savePdf({ buffer }));
    }
    const oversized = Buffer.alloc(storage.MAX_PDF_BYTES + 1);
    oversized.write('%PDF-');
    await assert.rejects(storage.savePdf({ buffer: oversized }), error => error.status === 413);
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    const key = await storage.savePdf({ buffer: pdf, academyId: '../../etc', certificateId: '../outside' });
    assert.equal(path.dirname(storage.pathFor(key)), root);
    assert.deepEqual(await fs.readFile(storage.pathFor(key)), pdf);
    assert.equal((await fs.stat(storage.pathFor(key))).mode & 0o777, 0o600);
    assert.throws(() => storage.pathFor('../outside'));
    // Previously issued certificates retain their academy subdirectory keys.
    await fs.mkdir(path.join(root, 'legacy-academy'));
    await fs.writeFile(path.join(root, 'legacy-academy', 'old.pdf'), pdf);
    assert.equal((await storage.stat('legacy-academy/old.pdf')).size, pdf.length);
    await storage.remove(key);
    await storage.remove(key);

    const deauthorized = { event: 'app_deauthorized', payload: { user_id: 'test-user', client_id: 'test-client' } };
    assert.equal((await invoke(deauthorized, { unsigned: true })).code, 401);
    assert.equal((await invoke(deauthorized, { timestamp: 1 })).code, 401);
    assert.equal((await invoke(deauthorized, { signedRaw: '{}' })).code, 401);
    assert.equal(deauthorizationLookups, 0);
    assert.equal((await invoke({ ...deauthorized, payload: { ...deauthorized.payload, client_id: 'another-app' } })).code, 200);
    assert.equal(deauthorizationLookups, 0);
    assert.equal((await invoke(deauthorized)).code, 200);
    assert.equal(deauthorizationLookups, 1);
    for (const body of [null, [], 'app_deauthorized']) assert.equal((await invoke(body)).code, 400);
    assert.equal((await invoke({ event: ['app_deauthorized'] })).code, 200);
    assert.equal(deauthorizationLookups, 1);
    const challenge = await invoke({ event: 'endpoint.url_validation', payload: { plainToken: 'challenge' } });
    assert.equal(challenge.body.encryptedToken, crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update('challenge').digest('hex'));
    console.log('Security regressions passed: query inputs, PDF storage/legacy paths, signed Zoom events.');
  } finally {
    Academy.find = originalFind;
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
