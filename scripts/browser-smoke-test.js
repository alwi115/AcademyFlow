const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');
async function main() {
  const base = process.argv[2];
  if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Provide the isolated local demo URL');
  const browser = await chromium.launch({ headless: true });
  const directory = path.join(require('./work-directory'), 'screenshots');
  await fs.mkdir(directory, { recursive: true });
  const errors = [];
  try {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/academy/login.html');
      await page.locator('[name="academyCode"]').fill('DEMO-001');
      await page.locator('[name="email"]').fill('owner@example.test');
      await page.locator('[name="password"]').fill('DemoOwner123!');
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL('**/academy/dashboard.html', { timeout: 30000 });
      for (const endpoint of ['/academy/dashboard.html', '/academy/calendar.html', '/academy/certificates.html', '/account/security.html']) {
        await page.goto(base + endpoint);
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth + 2), true, `Horizontal page overflow: ${endpoint}, ${viewport.width}`);
        if (endpoint.includes('calendar')) assert.equal(await page.locator('[data-calendar-date]').count(), 42);
        if (endpoint.includes('security')) assert.equal(await page.locator('#mfaStatus').innerText(), 'غير مفعّلة');
        await page.screenshot({ path: path.join(directory, endpoint.replace(/\W/g, '_') + '-' + viewport.width + '.png'), fullPage: true });
      }
      await page.goto(base + '/account/forgot-password.html');
      await page.locator('[name="academyCode"]').fill('DEMO-001');
      await page.locator('[name="email"]').fill('owner@example.test');
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.getElementById('message').textContent.includes('not configured'));
      for (const role of ['student', 'instructor']) {
        const csrfResponse = await context.request.get(base + '/api/auth/csrf');
        const { csrfToken } = await csrfResponse.json();
        const response = await context.request.post(base + '/api/auth/login', { data: { academyCode: 'DEMO-001', email: role + '@example.test', password: 'DemoOwner123!' }, headers: { 'x-csrf-token': csrfToken } });
        assert.equal(response.status(), 200);
        const { user } = await response.json();
        await page.evaluate(user => localStorage.setItem('af_user', JSON.stringify(user)), user);
        await page.goto(base + '/' + role + '/dashboard.html');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: path.join(directory, role + '-' + viewport.width + '.png'), fullPage: true });
        assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth + 2), true, `${role} dashboard overflow`);
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('Browser smoke passed: real login/CSRF, three role portals, calendar, certificates, security, recovery error state; desktop and mobile.');
  } finally { await browser.close(); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
