(function(){
  const THEME_KEY = 'af_theme';
  const APPEARANCE_KEY = 'af_appearance';

  function savedTheme() {
    try {
      const appearance = localStorage.getItem(APPEARANCE_KEY);
      if (appearance === 'light' || appearance === 'dark') return appearance;
      const legacy = localStorage.getItem(THEME_KEY);
      return legacy === 'light' || legacy === 'dark' ? legacy : null;
    } catch { return null; }
  }
  const DARK = 'dark';
  const LIGHT = 'light';

  function systemTheme(){
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
  }

  function normalizeTheme(value){
    return value === DARK ? DARK : LIGHT;
  }

  function currentTheme(){
    return normalizeTheme(document.documentElement.getAttribute('data-theme') || savedTheme() || systemTheme());
  }

  function updateThemeColor(theme){
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', theme === DARK ? '#101b29' : '#f6f8fc');
  }

  function refreshThemeControls(){
    const theme = currentTheme();
    const dark = theme === DARK;

    document.querySelectorAll('[data-theme-label]').forEach(el => {
      el.textContent = dark ? 'الوضع الفاتح' : 'الوضع الداكن';
    });

    document.querySelectorAll('[data-theme-toggle], .theme-toggle').forEach(el => {
      el.setAttribute('aria-pressed', dark ? 'true' : 'false');
      el.setAttribute('aria-label', dark ? 'التحويل إلى الوضع الفاتح' : 'التحويل إلى الوضع الداكن');
      el.title = dark ? 'التحويل إلى الوضع الفاتح' : 'التحويل إلى الوضع الداكن';

      if (el.matches('[data-theme-icon]')) {
        el.textContent = dark ? '☀' : '◐';
      }
    });
  }

  function applyTheme(theme, persist = true){
    const next = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', next);

    document.documentElement.setAttribute('data-appearance', next);
    if(persist) {
      try {
        localStorage.setItem(APPEARANCE_KEY, next);
        localStorage.setItem(THEME_KEY, next);
      } catch { /* Theme still works when browser storage is unavailable. */ }
    }

    updateThemeColor(next);
    refreshThemeControls();

    window.dispatchEvent(new CustomEvent('academyflow:themechange', {
      detail: { theme: next }
    }));

    return next;
  }

  function toggleTheme(){
    return applyTheme(currentTheme() === DARK ? LIGHT : DARK, true);
  }

  window.refreshAcademyFlowThemeControls = refreshThemeControls;
  window.toggleTheme = toggleTheme;
  window.setAcademyFlowTheme = applyTheme;
  window.getAcademyFlowTheme = currentTheme;

  applyTheme(savedTheme() || systemTheme(), false);

  window.addEventListener('storage', event => {
    if ([APPEARANCE_KEY, THEME_KEY, null].includes(event.key)) applyTheme(savedTheme() || systemTheme(), false);
  });

  function toggleSidebar(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open', sidebar.classList.contains('open'));
  }

  function closeSidebar(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }

  window.toggleSidebar = toggleSidebar;
  window.closeSidebar = closeSidebar;

  document.addEventListener('DOMContentLoaded', () => {
    refreshThemeControls();

    document.addEventListener('click', event => {
      const themeButton = event.target.closest('[data-theme-toggle], .theme-toggle');
      if(themeButton){
        event.preventDefault();
        toggleTheme();
        return;
      }

      const reloadButton = event.target.closest('[data-reload]');
      if(reloadButton){
        event.preventDefault();
        location.reload();
        return;
      }

      const backButton = event.target.closest('[data-back]');
      if(backButton){
        event.preventDefault();
        history.length > 1 ? history.back() : location.assign('/');
        return;
      }

      const sidebar = document.getElementById('sidebar');
      if(sidebar && sidebar.classList.contains('open') && window.innerWidth <= 860){
        const toggle = event.target.closest('.mobile-toggle');
        if(!sidebar.contains(event.target) && !toggle) closeSidebar();
      }

      const hashLink = event.target.closest('a[href^="#"]');
      if(hashLink){
        const id = hashLink.getAttribute('href');
        if(id && id.length > 1){
          const target = document.querySelector(id);
          if(target){
            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', id);
          }
        }
      }
    });

    document.querySelectorAll('.side-nav a').forEach(link => {
      link.addEventListener('click', () => {
        if(window.innerWidth <= 860) closeSidebar();
      });
    });
  });

  window.addEventListener('resize', () => {
    if(window.innerWidth > 860) closeSidebar();
  });

  if(window.matchMedia){
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = event => {
      if(!savedTheme()){
        applyTheme(event.matches ? DARK : LIGHT, false);
      }
    };

    if(media.addEventListener) media.addEventListener('change', onSystemChange);
    else if(media.addListener) media.addListener(onSystemChange);
  }
})();