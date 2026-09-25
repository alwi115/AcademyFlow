(function(){
  const saved = localStorage.getItem('af_theme');
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (systemDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

function refreshThemeControls(){
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  document.querySelectorAll('[data-theme-label]').forEach(el => {
    el.textContent = theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
  });
  document.querySelectorAll('.theme-toggle').forEach(el => {
    el.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    el.title = theme === 'dark' ? 'التحويل إلى الوضع الفاتح' : 'التحويل إلى الوضع الداكن';
  });
}

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('af_theme', next);
  refreshThemeControls();
}

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

document.addEventListener('DOMContentLoaded', () => {
  refreshThemeControls();

  document.addEventListener('click', event => {
    const sidebar = document.getElementById('sidebar');
    if(!sidebar || !sidebar.classList.contains('open') || window.innerWidth > 860) return;
    const toggle = event.target.closest('.mobile-toggle');
    if(!sidebar.contains(event.target) && !toggle) closeSidebar();
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
