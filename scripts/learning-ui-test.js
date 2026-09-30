// DOM simulation only: this does not open a browser or contact a website.
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function environment() {
  const $ = cheerio.load('<main id="test"></main>'), cache = new WeakMap();
  function wrap(node) {
    if (!node) return null;
    if (!cache.has(node)) cache.set(node, {
      get innerHTML() { return $(node).html(); }, set innerHTML(value) { $(node).html(value); },
      get textContent() { return $(node).text(); }, set textContent(value) { $(node).text(value); },
      get value() { return $(node).val(); }, set value(value) { $(node).val(value); },
      get dataset() { return $(node).data(); }, disabled: false, checked: false, focus() {},
      querySelector(selector) { return wrap($(node).find(selector)[0]); },
      querySelectorAll(selector) { return $(node).find(selector).toArray().map(wrap); }
    });
    return cache.get(node);
  }
  const context = vm.createContext({ window: {}, Intl, Date, URLSearchParams, TextEncoder });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/learning-tools.js'), 'utf8'), context);
  return { $, target: wrap($('#test')[0]), tools: context.window.AFLearning };
}
module.exports = async function testUI() {
  const env = environment();
  const sample = { timezone: 'Asia/Dubai', generatedAt: '2026-09-30T21:00:00.000Z', courses: [{ id: 'course', title: 'دورة تجريبية' }], events: [
    { id: 'live-one', title: '<img src=x onerror=alert(1)>', type: 'live', at: '2026-09-30T21:30:00.000Z', course: 'دورة', href: '/student/live.html', status: 'scheduled' },
    { id: 'assignment-one', title: 'واجب', type: 'assignment', at: '2026-10-01T11:00:00.000Z', course: 'دورة', href: '/student/assignments.html', status: 'published', phase: 'due' }
  ] };
  const urls = [];
  await env.tools.calendar({ target: env.target, portal: 'student', api: async url => { urls.push(url); return sample; } });
  assert.equal(env.$('.learning-day').length, 42);
  assert.equal(env.$('[aria-pressed="true"]').attr('data-day'), '2026-10-01', 'academy timezone crosses UTC month boundary');
  assert.equal(env.$('#learningEvents .learning-event').length, 2);
  assert.equal(env.$('img').length, 0, 'untrusted titles must be escaped');
  assert.ok(urls[1].includes('from='));
  const filter = env.target.querySelector('#learningType'); filter.value = 'assignment'; filter.onchange();
  assert.equal(env.$('#learningEvents .learning-event').length, 1);
  assert.equal(env.$('#learningEvents h4').text(), 'واجب');
  const emptyDay = env.target.querySelector('[data-day="2026-10-02"]'); emptyDay.onclick();
  assert.match(env.$('#learningEvents').text(), /لا توجد مواعيد/);
  const exportButton = env.target.querySelector('#learningExport'); assert.equal(exportButton.disabled, false);
  const progress = environment();
  await progress.tools.progress({ target: progress.target, api: async () => ({ total: 2, completed: 1, courses: [{ id: 'c', title: '<b>Course</b>', status: 'active', total: 2, completed: 1, remaining: 1, percent: 50, assignments: { completed: 0, total: 1 }, quizzes: { completed: 1, total: 1 }, next: { title: 'Next lesson', href: '/student/course.html?id=c&lesson=l' }, steps: [{ id: 'l', title: 'Next lesson', completed: false, href: '/student/course.html?id=c&lesson=l' }] }] }) });
  assert.equal(progress.$('progress').attr('value'), '1');
  assert.ok(progress.$('a.btn').attr('href').includes('&lesson=l'));
  assert.equal(progress.$('h2 b').length, 0);
  const failed = environment();
  await failed.tools.progress({ target: failed.target, api: async () => { throw Error('Network failure'); } });
  assert.match(failed.$('[role="alert"]').text(), /Network failure/);
  assert.ok(failed.target.querySelector('button').onclick);
  const follow = environment();
  await follow.tools.followUp({ target: follow.target, portal: 'instructor', api: async () => ({ rows: [], courses: [], page: 1, pages: 1, totalEnrollments: 0 }) });
  assert.equal(follow.target.querySelector('#followPrev').disabled, true);
  assert.equal(follow.target.querySelector('#followNext').disabled, true);
  assert.match(follow.$('#followRows').text(), /لا توجد تسجيلات/);
  console.log('Learning UI DOM simulation passed: timezone calendar/filter/selection, escaped content, progress links, error retry and empty pagination.');
};
if (require.main === module) module.exports().catch(err => { console.error(err); process.exitCode = 1; });
