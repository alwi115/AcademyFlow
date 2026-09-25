(function(){
  const saved = localStorage.getItem('af_theme');
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (systemDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('af_theme', next);
  document.querySelectorAll('[data-theme-label]').forEach(el => {
    el.textContent = next === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
  });
}

function toggleSidebar(){
  const sidebar = document.getElementById('sidebar');
  if(sidebar) sidebar.classList.toggle('open');
}
