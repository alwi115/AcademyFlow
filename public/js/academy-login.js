document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const code = document.getElementById('academyCode');
  const email = document.getElementById('academyEmail');
  const password = document.getElementById('academyPassword');
  const toggle = document.getElementById('academyPasswordToggle');
  const remember = document.getElementById('rememberAcademy');
  const helpButton = document.querySelector('[data-login-help]');
  const help = document.getElementById('loginHelp');
  const langButton = document.querySelector('[data-login-lang]');
  const REMEMBER_KEY = 'af_login_identity';
  const LANG_KEY = 'af_login_lang';

  if (code) {
    code.addEventListener('input', () => {
      let value = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (/^AF\d/.test(value)) value = 'AF-' + value.slice(2).replace(/-/g, '');
      code.value = value.slice(0, 32);
    });
  }

  if (password && toggle) {
    toggle.addEventListener('click', () => {
      const hidden = password.type === 'password';
      password.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? (document.documentElement.lang === 'en' ? 'Hide' : 'إخفاء') : (document.documentElement.lang === 'en' ? 'Show' : 'إظهار');
      toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      password.focus({ preventScroll: true });
    });
  }

  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (code && saved.academyCode) code.value = String(saved.academyCode).slice(0, 32);
      if (email && saved.email) email.value = String(saved.email).slice(0, 254);
      if (remember) remember.checked = true;
    }
  } catch {}

  const form = document.getElementById('academyLoginForm');
  form?.addEventListener('submit', () => {
    try {
      if (remember?.checked) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({
          academyCode: code?.value.trim().toUpperCase() || '',
          email: email?.value.trim().toLowerCase() || ''
        }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {}
  }, { capture: true });

  helpButton?.addEventListener('click', () => {
    const open = help?.hidden !== false;
    if (help) help.hidden = !open;
    helpButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const translations = new Map([
    ['انتقل لتسجيل الدخول','Skip to sign in'],['العودة للرئيسية','Back to home'],
    ['ارجع لنفس المكان','Return to the same place'],['اللي شغلك واقف عنده.','where your work left off.'],
    ['كود الأكاديمية يحدد مساحة العمل، وبعد الدخول يفتح AcademyFlow الواجهة المناسبة حسب دورك وصلاحياتك.','Your academy code identifies the workspace, then AcademyFlow opens the experience that matches your role and permissions.'],
    ['مساحة مستقلة','Isolated workspace'],['بيانات كل أكاديمية ضمن سياقها','Each academy stays in its own data context'],
    ['صلاحيات محددة','Scoped permissions'],['واجهة حسب الدور','Experience matched to the role'],
    ['تسجيل الدخول الآمن','Secure sign in'],['مرحبًا برجعتك','Welcome back'],
    ['استخدم كود الأكاديمية والبريد وكلمة المرور للدخول لمساحتك.','Use your academy code, email, and password to access your workspace.'],
    ['كود الأكاديمية','Academy code'],['مثال AF-0001','Example AF-0001'],['البريد الإلكتروني','Email address'],['كلمة المرور','Password'],
    ['إظهار','Show'],['إخفاء','Hide'],['تذكر كود الأكاديمية والبريد','Remember academy code and email'],['نسيت كلمة المرور؟','Forgot password?'],
    ['استعادة الوصول','Restore access'],['إذا نسيت كلمة المرور، تواصل مع إدارة أكاديميتك. وإذا كنت مالك الأكاديمية وتحتاج مساعدة، استخدم مركز الدعم.','If you forgot your password, contact your academy administrator. Academy owners can use the support center for help.'],
    ['فتح مركز الدعم ↗','Open support center ↗'],['دخول إلى AcademyFlow','Sign in to AcademyFlow'],
    ['جلسة آمنة','Secure session'],['AcademyFlow يستخدم جلسة HttpOnly وSameSite، مع حماية من محاولات الدخول المتكررة.','AcademyFlow uses HttpOnly and SameSite sessions with protection against repeated login attempts.'],
    ['الخصوصية','Privacy'],['الشروط','Terms'],['الدعم','Support']
  ]);

  let snapshot = null;
  function collectTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement && ['SCRIPT','STYLE'].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const out = []; let node;
    while ((node = walker.nextNode())) out.push({ node, value: node.nodeValue });
    return out;
  }

  function setLanguage(lang) {
    const next = lang === 'en' ? 'en' : 'ar';
    if (!snapshot) snapshot = collectTextNodes();
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'en' ? 'ltr' : 'rtl';
    if (langButton) langButton.textContent = next === 'en' ? 'AR' : 'EN';

    if (next === 'ar') {
      snapshot.forEach(item => { if (item.node.isConnected) item.node.nodeValue = item.value; });
    } else {
      snapshot.forEach(item => {
        if (!item.node.isConnected) return;
        const raw = item.value;
        const key = raw.trim();
        const translated = translations.get(key);
        if (!translated) return;
        const lead = raw.match(/^\s*/)?.[0] || '';
        const tail = raw.match(/\s*$/)?.[0] || '';
        item.node.nodeValue = lead + translated + tail;
      });
    }

    if (toggle && password) {
      const visible = password.type === 'text';
      toggle.textContent = next === 'en' ? (visible ? 'Hide' : 'Show') : (visible ? 'إخفاء' : 'إظهار');
    }
    try { localStorage.setItem(LANG_KEY, next); } catch {}
  }

  let initialLanguage = 'ar';
  try { initialLanguage = localStorage.getItem(LANG_KEY) || 'ar'; } catch {}
  setLanguage(initialLanguage);
  langButton?.addEventListener('click', () => setLanguage(document.documentElement.lang === 'en' ? 'ar' : 'en'));

  function syncThemeMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.documentElement.dataset.theme === 'dark' ? '#111411' : '#f2f0e8';
  }
  syncThemeMeta();
  addEventListener('academyflow:themechange', syncThemeMeta);
});