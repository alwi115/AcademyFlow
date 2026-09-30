document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.academy-sidebar, .student-sidebar, .instructor-sidebar, .sa-sidebar, .sidebar');
  if (!sidebar || sidebar.querySelector('[href="/account/security.html"]')) return;
  const link = document.createElement('a');
  link.href = '/account/security.html'; link.className = 'account-security-link'; link.textContent = 'أمان الحساب';
  const navs = sidebar.querySelectorAll('nav');
  (navs[navs.length - 1] || sidebar).appendChild(link);
});
