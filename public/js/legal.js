(() => {
  let config = null;

  const escText = value => String(value ?? '');

  function setAll(selector, value, fallback = '—') {
    document.querySelectorAll(selector).forEach(el => {
      el.textContent = value ? escText(value) : fallback;
    });
  }

  async function loadConfig() {
    if (config) return config;

    const response = await fetch('/api/public/legal-config', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error('تعذر تحميل بيانات المنصة');
    config = await response.json();

    setAll('[data-platform-name]', config.platformName || 'AcademyFlow', 'AcademyFlow');
    setAll('[data-legal-entity]', config.legalEntityName, 'AcademyFlow');
    setAll('[data-cr]', config.commercialRegistrationNumber, 'غير مدخل بعد');
    setAll('[data-ecommerce-license]', config.ecommerceLicenseNumber, 'غير مطبق / غير مدخل');
    setAll('[data-tax]', config.taxNumber, 'غير مطبق / غير مدخل');
    setAll('[data-address]', config.businessAddress, 'غير مدخل بعد');
    setAll('[data-privacy-officer-name]', config.privacyOfficerName, 'غير مدخل بعد');
    setAll('[data-support-email]', config.supportEmail, 'استخدم نموذج طلب الخصوصية أو الدعم داخل المنصة');
    setAll('[data-support-phone]', config.supportPhone, 'غير مدخل بعد');
    setAll('[data-privacy-email]', config.privacyOfficerEmail || config.supportEmail, 'استخدم نموذج طلب الخصوصية');
    setAll('[data-trial-days]', config.trialDays ?? 15, '15');
    setAll('[data-grace-days]', config.graceDays ?? 5, '5');
    setAll('[data-legal-version]', config.legalVersion, '2026-09-27');
    setAll('[data-year]', new Date().getFullYear(), String(new Date().getFullYear()));

    document.querySelectorAll('[data-support-mail-link]').forEach(a => {
      if (config.supportEmail) {
        a.href = 'mailto:' + config.supportEmail;
        a.hidden = false;
      } else {
        a.hidden = true;
      }
    });

    document.querySelectorAll('[data-privacy-mail-link]').forEach(a => {
      const email = config.privacyOfficerEmail || config.supportEmail;
      if (email) {
        a.href = 'mailto:' + email;
        a.hidden = false;
      } else {
        a.hidden = true;
      }
    });

    return config;
  }

  async function bindPrivacyRequest() {
    const form = document.getElementById('privacyRequestForm');
    if (!form) return;

    const result = document.getElementById('privacyRequestResult');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.submitting === '1') return;

      const submit = form.querySelector('button[type="submit"]');
      const original = submit.textContent;
      form.dataset.submitting = '1';
      submit.disabled = true;
      submit.textContent = 'جاري الإرسال...';
      result.className = 'legal-result';
      result.textContent = '';

      try {
        const body = Object.fromEntries(new FormData(form).entries());
        const response = await fetch('/api/public/privacy-requests', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'تعذر إرسال الطلب');
        }

        result.className = 'legal-result success';
        result.textContent = data.requestNumber
          ? 'تم استلام الطلب. رقم المتابعة: ' + data.requestNumber
          : 'تم استلام الطلب.';
        form.reset();
      } catch (err) {
        result.className = 'legal-result error';
        result.textContent = err.message || 'تعذر إرسال الطلب';
      } finally {
        form.dataset.submitting = '0';
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }

  async function bindLegalAcceptance() {
    const form = document.getElementById('legalAcceptanceForm');
    if (!form) return;

    const result = document.getElementById('legalAcceptanceResult');
    const version = (await loadConfig()).legalVersion;

    try {
      const meResponse = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const me = await meResponse.json().catch(() => ({}));

      if (!meResponse.ok || !me.user) {
        location.replace('/academy/login.html');
        return;
      }

      if (me.user.role !== 'owner') {
        location.replace('/academy/dashboard.html');
        return;
      }

      if (!me.user.legalAcceptanceRequired) {
        location.replace('/academy/dashboard.html');
        return;
      }

      setAll('[data-owner-name]', me.user.name || 'مالك الأكاديمية');
      setAll('[data-academy-name]', me.user.academyName || 'الأكاديمية');
    } catch {
      location.replace('/academy/login.html');
      return;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const checkbox = document.getElementById('legalAcceptCheck');
      if (!checkbox.checked) {
        result.className = 'legal-result error';
        result.textContent = 'يجب تحديد مربع الموافقة قبل المتابعة.';
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      const original = submit.textContent;
      submit.disabled = true;
      submit.textContent = 'جاري تسجيل القبول...';

      try {
        const csrfResponse = await fetch('/api/auth/csrf', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        const csrfData = await csrfResponse.json().catch(() => ({}));
        if (!csrfResponse.ok || !csrfData.csrfToken) {
          throw new Error('تعذر تهيئة الحماية');
        }

        const response = await fetch('/api/auth/legal-acceptance', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            _csrf: csrfData.csrfToken,
            accepted: true,
            termsVersion: version,
            privacyVersion: version,
            dpaVersion: version
          })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(data.message || 'تعذر تسجيل القبول');

        try {
          const current = JSON.parse(localStorage.getItem('af_user') || '{}');
          current.legalAcceptanceRequired = false;
          current.legalVersion = version;
          localStorage.setItem('af_user', JSON.stringify(current));
        } catch {}

        result.className = 'legal-result success';
        result.textContent = 'تم تسجيل قبولك بنجاح.';
        setTimeout(() => location.replace('/academy/dashboard.html'), 450);
      } catch (err) {
        result.className = 'legal-result error';
        result.textContent = err.message || 'تعذر تسجيل القبول';
      } finally {
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try { await loadConfig(); } catch {}
    await bindPrivacyRequest();
    await bindLegalAcceptance();
  });
})();
