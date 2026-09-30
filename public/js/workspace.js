'use strict';
(() => {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
    courses: '<path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 5h3m4 0h3"/>',
    live: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 9 5-3v12l-5-3Z"/>',
    document: '<path d="M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8m-8 4h6"/>',
    payments: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-14 5h4"/>',
    reports: '<path d="M4 3v18h17M8 16v-5m5 5V6m5 10V9"/>',
    notifications: '<path d="M5 16V10a7 7 0 0 1 14 0v6l2 2H3ZM9 21h6"/>',
    support: '<path d="M4 17v-6a8 8 0 0 1 16 0v6m-1 0v2a2 2 0 0 1-2 2h-5"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    security: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/>',
    certificates: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 7 6-3 6 3-2-7"/>',
    branches: '<path d="M4 21V8l8-5 8 5v13ZM9 21v-6h6v6M8 9h1m6 0h1m-8 3h1m6 0h1"/>',
    attendance: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    lessons: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4Z"/>'
  };
  const aliases = { students:'people',instructors:'people',staff:'people',groups:'people',profile:'people',enrollments:'document',assignments:'document',assessments:'document',quizzes:'document','quiz-builder':'document',subscriptions:'payments',plans:'document',academies:'branches',health:'reports',audit:'document',compliance:'security',privacy:'security' };
  const brandMarkup = '<span class="brand-symbol" aria-hidden="true">a<span>f</span></span><span class="brand-text"><b>Academy<span class="brand-light">Flow</span></b><small>مساحة للتعلّم. نظام للنمو.</small></span>';

  function decorateBrand(brand) {
    if (!brand || brand.dataset.workspaceBrand) return;
    brand.innerHTML = brandMarkup;
    brand.setAttribute('aria-label', 'AcademyFlow — الرئيسية');
    brand.dataset.workspaceBrand = 'true';
  }

  function enhance(root) {
    if (!root || root.dataset.workspaceReady) return;
    root.dataset.workspaceReady = 'true';
    const sidebar = root.querySelector('aside[class$="-sidebar"]');
    const main = root.querySelector('main');
    const footer = root.querySelector('.academy-footer,.student-footer,.instructor-footer,.sa-footer');
    root.querySelectorAll('.brand').forEach(decorateBrand);
    if (main) {
      main.id = main.id || 'af-main';
      main.tabIndex = -1;
      const skip = document.createElement('a');
      skip.className = 'af-skip'; skip.href = '#' + main.id; skip.textContent = 'تخطّي إلى المحتوى';
      root.prepend(skip);
    }
    if (footer) {
      footer.innerHTML = '<span class="af-footer-wordmark">AcademyFlow<span aria-hidden="true">®</span></span><span>مساحة للتعلّم. نظام للنمو.</span><nav class="af-footer-links" aria-label="روابط المساعدة والسياسات"><a href="/legal/support.html">الدعم</a><a href="/legal/privacy.html">الخصوصية</a><a href="/legal/terms.html">الشروط</a></nav>';
    }
    root.querySelectorAll('nav').forEach(nav => {
      const section = nav.previousElementSibling;
      if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', section?.textContent.trim() || 'التنقل');
    });
    root.querySelectorAll('nav a').forEach(link => {
      if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
      const icon = link.querySelector('[class$="-nav-icon"]');
      if (!icon) return;
      const page = (link.getAttribute('href') || '').split('/').pop().replace('.html','');
      icon.setAttribute('aria-hidden','true');
      icon.innerHTML = '<svg class="af-icon" viewBox="0 0 24 24" aria-hidden="true">' + (paths[aliases[page] || page] || paths.document) + '</svg>';
    });
    root.querySelectorAll('button[id$="ModalClose"]').forEach(button => button.setAttribute('aria-label','إغلاق النافذة'));
    if (window.refreshAcademyFlowThemeControls) window.refreshAcademyFlowThemeControls();
    if (sidebar && main) setupMenu(root, sidebar, main);
    if (document.body.dataset.page === 'dashboard' && !document.body.classList.contains('academy-app')) addWelcome(root);
  }

  function setupMenu(root, sidebar, main) {
    const toggle = root.querySelector('button[id$="MenuButton"]');
    const overlay = root.querySelector('[id$="Overlay"]');
    if (!toggle || !overlay) return;
    const narrow = window.matchMedia('(max-width: 900px)');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'af-menu-close'; close.textContent = '×'; close.setAttribute('aria-label','إغلاق القائمة');
    sidebar.prepend(close);
    toggle.setAttribute('aria-controls',sidebar.id);
    function sync() {
      const open = narrow.matches && sidebar.classList.contains('open');
      toggle.setAttribute('aria-expanded',String(open));
      toggle.setAttribute('aria-label',open ? 'إغلاق القائمة' : 'فتح القائمة');
      sidebar.inert = narrow.matches && !open;
      main.inert = open;
      document.body.classList.toggle('af-menu-open',open);
      if (open && !sidebar.contains(document.activeElement)) close.focus();
      if (!open && sidebar.contains(document.activeElement) && narrow.matches) toggle.focus();
    }
    function dismiss() {
      sidebar.classList.remove('open'); overlay.classList.remove('show'); sync();
    }
    close.addEventListener('click',dismiss);
    toggle.addEventListener('click',sync);
    overlay.addEventListener('click',sync);
    sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click',dismiss));
    new MutationObserver(sync).observe(sidebar,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',event => {
      if (!narrow.matches || !sidebar.classList.contains('open')) return;
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); toggle.focus(); }
      if (event.key === 'Tab') {
        const nodes = [...sidebar.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length-1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    const resize = () => { if (!narrow.matches) dismiss(); else sync(); };
    if (narrow.addEventListener) narrow.addEventListener('change',resize);
    else narrow.addListener(resize);
    sync();
  }

  function addWelcome(root) {
    const copy = document.body.classList.contains('student-app')
      ? ['خطوة اليوم،','تقرّبك أكثر.','دوراتك، مواعيدك، وتقدّمك في مساحة واحدة. واصل رحلتك من حيث توقّفت.','/student/courses.html','واصل التعلّم']
      : document.body.classList.contains('instructor-app')
      ? ['ركّز على التعليم.','واترك التفاصيل لمساحتك.','تابع طلابك، جهّز دروسك، وخطّط لمحاضرتك القادمة من مكان واحد.','/instructor/courses.html','استعرض دوراتك']
      : ['الصورة كاملة.','في مساحة واحدة.','تابع الأكاديميات والاشتراكات وصحة المنصة، وخلّ قراراتك أقرب لبياناتك.','/superadmin/academies.html','استعرض الأكاديميات'];
    const target = root.querySelector('#studentPageContent,#pageContent,#saPageContent');
    if (!target) return;
    const section = document.createElement('section'); section.className = 'af-overview';
    const text = document.createElement('div');
    const kicker = document.createElement('span'); kicker.className = 'af-overview-kicker';
    kicker.textContent = new Intl.DateTimeFormat('ar',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
    const heading = document.createElement('h2'); heading.append(copy[0],document.createElement('br'));
    const accent = document.createElement('span'); accent.textContent = copy[1]; heading.append(accent);
    const paragraph = document.createElement('p'); paragraph.textContent = copy[2];
    const link = document.createElement('a'); link.href = copy[3]; link.className = 'af-overview-link'; link.textContent = copy[4] + ' ↙';
    text.append(kicker,heading,paragraph); section.append(text,link); target.before(section);
  }

  window.AcademyFlowWorkspace = { enhance };
  document.addEventListener('DOMContentLoaded',() => {
    if (!document.body.classList.contains('af-workspace')) return;
    if (document.body.dataset.accountPage === 'security') {
      const header = document.createElement('header'); header.className = 'af-standalone-header';
      header.innerHTML = '<a class="brand" href="/">' + brandMarkup + '</a><button class="theme-toggle" type="button" data-theme-toggle data-theme-icon aria-label="تبديل المظهر">◐</button>';
      document.body.prepend(header);
      enhance(document.body);
    } else if (document.body.classList.contains('legal-page')) enhance(document.body);
  });
})();
