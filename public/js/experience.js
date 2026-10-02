'use strict';

(() => {
  const one = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = one('#publicNav');
  const menu = one('.menu-toggle');
  const menuPanel = one('#publicMenu');

  const closeMenu = (restoreFocus = false) => {
    if (!menu || !menuPanel) return;
    menuPanel.classList.remove('open');
    document.body.classList.remove('menu-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'فتح القائمة');
    if (restoreFocus) menu.focus();
  };

  if (nav && menu && menuPanel) {
    menu.addEventListener('click', () => {
      const opening = menu.getAttribute('aria-expanded') !== 'true';
      menuPanel.classList.toggle('open', opening);
      document.body.classList.toggle('menu-open', opening);
      menu.setAttribute('aria-expanded', String(opening));
      menu.setAttribute('aria-label', opening ? 'إغلاق القائمة' : 'فتح القائمة');
      if (opening) menuPanel.querySelector('a')?.focus();
    });

    menuPanel.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('click', event => {
      if (!nav.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') closeMenu(true);
    });

    const updateNav = () => nav.classList.toggle('compact', window.scrollY > 24);
    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 800) closeMenu();
    });
  }

  if ('IntersectionObserver' in window && !reducedMotion) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    all('[data-reveal]').forEach(element => revealObserver.observe(element));
  } else {
    all('[data-reveal]').forEach(element => element.classList.add('revealed'));
  }

  const flowStates = {
    course: {
      label: 'إعداد الدورة', status: 'مسودة', title: 'التصميم الرقمي',
      fields: [['المدرب', 'أحمد الهاشمي'], ['نمط التقديم', 'هجين'], ['الحالة', 'جاهزة للنشر']],
      number: '01', description: 'ابدأ بهيكل واضح للدورة، ثم أضف دروسها ومدربها قبل فتح التسجيل.'
    },
    people: {
      label: 'التسجيل والمجموعات', status: 'قيد التنظيم', title: 'المجموعة أ',
      fields: [['المسجلون', '24 طالبًا'], ['المدرب', 'أحمد الهاشمي'], ['الفرع', 'مسقط']],
      number: '02', description: 'اجمع الطلاب في مجموعاتهم واربط كل مجموعة بالدورة والمدرب والفرع المناسب.'
    },
    schedule: {
      label: 'الجدولة', status: 'مجدولة', title: 'حصة تصميم الواجهات',
      fields: [['الموعد', 'الخميس 04:30'], ['التكرار', 'أسبوعي'], ['التقديم', 'عبر Zoom']],
      number: '03', description: 'حوّل خطة الدورة إلى مواعيد واضحة، حضورية أو عن بُعد، بدون فصلها عن سياقها.'
    },
    measure: {
      label: 'المتابعة', status: 'محدّث الآن', title: 'تقرير الدورة',
      fields: [['الحضور', '92%'], ['الاختبار', '18 محاولة'], ['الإنجاز', '78%']],
      number: '04', description: 'تعود نتائج الحضور والاختبارات والتقدّم إلى السجل نفسه لتكتمل صورة الدورة.'
    }
  };

  const flowButtons = all('[data-flow]');
  const setFlow = button => {
    const state = flowStates[button.dataset.flow];
    const preview = one('#flowPreview');
    if (!state || !preview) return;
    flowButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    preview.classList.add('changing');
    const update = () => {
      preview.dataset.state = button.dataset.flow;
      one('#flowLabel').textContent = state.label;
      one('#flowStatus').textContent = state.status;
      one('#flowPreviewTitle').textContent = state.title;
      ['One', 'Two', 'Three'].forEach((suffix, index) => {
        one(`#flowField${suffix}`).textContent = state.fields[index][0];
        one(`#flowValue${suffix}`).textContent = state.fields[index][1];
      });
      one('#flowNumber').textContent = state.number;
      one('#flowDescription').textContent = state.description;
      all('.context-path i').forEach((item, index) => item.classList.toggle('active', index === Number(state.number) - 1));
      preview.classList.remove('changing');
    };
    reducedMotion ? update() : window.setTimeout(update, 100);
  };

  flowButtons.forEach(button => {
    button.addEventListener('click', () => setFlow(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = flowButtons.indexOf(button);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? flowButtons.length - 1 :
        (current + (event.key === 'ArrowLeft' ? 1 : -1) + flowButtons.length) % flowButtons.length;
      flowButtons[target].focus();
      setFlow(flowButtons[target]);
    });
  });

  const roleStates = {
    academy: {
      title: 'مساحة الإدارة', meta: 'كل الأكاديمية', greeting: 'صورة اليوم أمامك.',
      primary: ['الطلاب النشطون', '248', 'عبر 12 دورة'],
      list: [['تقارير الحضور', 'جاهزة'], ['جلسات اليوم', '04'], ['إشعارات جديدة', '07']]
    },
    instructor: {
      title: 'مساحة المدرب', meta: '3 دورات', greeting: 'يومك التعليمي مرتب.',
      primary: ['الحصة القادمة', '04:30', 'التصميم الرقمي'],
      list: [['طلاب يحتاجون متابعة', '02'], ['واجبات للتصحيح', '06'], ['تقييمات الحصة', '18']]
    },
    student: {
      title: 'مساحة الطالب', meta: 'رحلة التعلّم', greeting: 'خطوتك القادمة واضحة.',
      primary: ['إنجاز المسار', '84%', '7 دروس مكتملة'],
      list: [['الحصة القادمة', '04:30'], ['واجب قريب', 'الخميس'], ['شهادة متاحة', '01']]
    }
  };

  const roleButtons = all('[data-role]');
  const setRole = button => {
    const state = roleStates[button.dataset.role];
    const screen = one('#roleScreen');
    if (!state || !screen) return;
    roleButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    screen.classList.add('changing');
    const update = () => {
      screen.dataset.roleState = button.dataset.role;
      one('#roleScreenTitle').textContent = state.title;
      one('#roleScreenMeta').textContent = state.meta;
      one('#roleGreeting').textContent = state.greeting;
      one('#rolePrimaryLabel').textContent = state.primary[0];
      one('#rolePrimaryValue').textContent = state.primary[1];
      one('#rolePrimaryNote').textContent = state.primary[2];
      const rows = state.list.map(([label, value]) => {
        const row = document.createElement('p');
        const text = document.createElement('span');
        const result = document.createElement('b');
        text.textContent = label;
        result.textContent = value;
        row.append(text, result);
        return row;
      });
      one('#roleList').replaceChildren(...rows);
      screen.classList.remove('changing');
    };
    reducedMotion ? update() : window.setTimeout(update, 100);
  };

  roleButtons.forEach(button => {
    button.addEventListener('click', () => setRole(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = roleButtons.indexOf(button);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? roleButtons.length - 1 :
        (current + (event.key === 'ArrowLeft' ? 1 : -1) + roleButtons.length) % roleButtons.length;
      roleButtons[target].focus();
      setRole(roleButtons[target]);
    });
  });
})();
