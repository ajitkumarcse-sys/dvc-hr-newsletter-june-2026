// Shared auth layer: Supabase client, session/profile state, nav controls,
// and the login / register / password-reset modal. Loaded on every page.
(function () {
  'use strict';
  const cfg = window.APP_CONFIG;

  // ---------- Helpers (shared with page scripts via window.UI) ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const fmtDate = (iso, withTime = true) => {
    if (!iso) return '';
    const opts = withTime
      ? { dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }
      : { dateStyle: 'medium', timeZone: 'Asia/Kolkata' };
    return new Intl.DateTimeFormat('hi-IN', opts).format(new Date(iso)) + (withTime ? ' भा.मा.स.' : '');
  };
  const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  const homeUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
  };

  let toastTimer;
  function toast(msg, type) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('error', type === 'error');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
  }

  function friendly(error) {
    const m = (error && (error.message || error.error_description)) || 'कुछ गड़बड़ी हुई। कृपया पुनः प्रयास करें।';
    if (/invalid login credentials/i.test(m)) return 'ईमेल या पासवर्ड गलत है।';
    if (/email not confirmed/i.test(m)) return 'कृपया पहले अपने ईमेल पते की पुष्टि करें — आपके इनबॉक्स में भेजा गया पुष्टि लिंक खोलें, फिर लॉग इन करें।';
    if (/already registered|already been registered|user already exists/i.test(m)) return 'इस ईमेल पते से एक खाता पहले से मौजूद है। कृपया लॉग इन करें।';
    if (/not authorized|error sending (confirmation|recovery|magic link)? ?email/i.test(m)) {
      return 'अभी ईमेल नहीं भेजा जा सका। कृपया बाद में पुनः प्रयास करें या dvchrnewsletter@gmail.com पर संपादक मंडल से संपर्क करें।';
    }
    if (/rate limit|too many/i.test(m) || error?.status === 429) return 'बहुत अधिक प्रयास किए गए हैं। कृपया कुछ मिनट रुककर पुनः प्रयास करें।';
    if (/failed to fetch|network/i.test(m)) return 'सर्वर से संपर्क नहीं हो सका। अपना इंटरनेट कनेक्शन जाँचें और पुनः प्रयास करें।';
    console.warn('Unmapped error:', m);
    return 'कुछ गड़बड़ हो गई। कृपया कुछ देर बाद पुनः प्रयास करें। (' + m + ')';
  }

  async function withBusy(form, fn) {
    const btn = form.querySelector('button[type="submit"]');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'कृपया प्रतीक्षा करें…'; }
    try { return await fn(); }
    catch (err) { console.error(err); return { error: err }; }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  window.UI = { esc, fmtDate, wordCount, toast, friendly, withBusy, homeUrl, store };

  // ---------- Supabase client ----------
  if (!window.supabase || !cfg) {
    console.error('Supabase library or config failed to load.');
    window.Auth = { ready: true, user: null, profile: null, isEditor: false, unavailable: true, onChange(fn) { fn(this); } };
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('navAuth');
      if (el) el.innerHTML = '';
    });
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.sb = sb;

  // ---------- Auth state ----------
  const Auth = {
    session: null,
    user: null,
    profile: null,
    ready: false,
    _subs: [],
    get isEditor() { return this.profile?.role === 'editor'; },
    onChange(fn) { this._subs.push(fn); if (this.ready) fn(this); },
    _emit() { this._subs.forEach((fn) => { try { fn(this); } catch (e) { console.error(e); } }); },
    async reloadProfile() {
      this.profile = await loadProfile(this.user);
      renderNav();
      this._emit();
    }
  };
  window.Auth = Auth;

  async function loadProfile(user) {
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { console.error('Profile load failed', error); return null; }
    return data;
  }

  async function applySession(session) {
    Auth.session = session;
    Auth.user = session?.user ?? null;
    Auth.profile = Auth.user ? await loadProfile(Auth.user) : null;
    Auth.ready = true;
    renderNav();
    Auth._emit();
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(() => openAuth('reset'), 0);
    const sameUser = (session?.user?.id || null) === (Auth.user?.id || null);
    if (Auth.ready && sameUser && event !== 'USER_UPDATED') { Auth.session = session; return; }
    // Defer: calling other Supabase methods inside this callback can deadlock.
    setTimeout(() => applySession(session), 0);
  });

  // ---------- Nav controls ----------
  function renderNav() {
    const el = document.getElementById('navAuth');
    if (!el) return;
    if (!Auth.ready) { el.innerHTML = ''; return; }
    if (!Auth.user) {
      el.innerHTML = '<button class="btn-login" type="button" data-open-auth="login">लॉग इन करें</button>';
      return;
    }
    const p = Auth.profile || {};
    const name = p.full_name || Auth.user.email;
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    el.innerHTML = `
      <button class="user-chip" type="button" id="userChip" aria-haspopup="menu" aria-expanded="false" title="${esc(name)}">
        <span class="avatar">${esc(initials)}</span><span class="uname">${esc(name.split(' ')[0])}</span>
      </button>
      <div class="user-menu" id="userMenu" role="menu">
        <div class="um-head">
          <b>${esc(name)}${Auth.isEditor ? '<span class="role-badge">संपादक</span>' : ''}</b>
          <span>${esc(Auth.user.email)}</span>
        </div>
        <a href="${esc(homeUrl())}#account" data-action="account" role="menuitem"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-user"/></svg>मेरी प्रोफ़ाइल और प्रविष्टियाँ</a>
        ${Auth.isEditor ? '<a href="dashboard.html" role="menuitem"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-folder"/></svg>संपादक डैशबोर्ड</a>' : ''}
        <button type="button" data-action="logout" role="menuitem"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-logout"/></svg>लॉग आउट</button>
      </div>`;
  }

  async function signOut() {
    await sb.auth.signOut();
    toast('आपने लॉग आउट कर लिया है।');
    if (/dashboard\.html$/.test(location.pathname)) location.href = homeUrl();
  }

  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open-auth]');
    if (openBtn) { e.preventDefault(); openAuth(openBtn.dataset.openAuth); return; }

    const menu = document.getElementById('userMenu');
    const chip = e.target.closest('#userChip');
    if (chip && menu) {
      const open = menu.classList.toggle('open');
      chip.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    if (menu && !e.target.closest('#userMenu')) menu.classList.remove('open');

    const act = e.target.closest('[data-action]');
    if (!act) return;
    if (act.dataset.action === 'logout') { e.preventDefault(); menu?.classList.remove('open'); signOut(); }
    if (act.dataset.action === 'account' && window.openAccount) {
      e.preventDefault();
      menu?.classList.remove('open');
      window.openAccount();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('userMenu')?.classList.remove('open');
  });

  // ---------- Auth modal ----------
  const MODAL_HTML = `
  <dialog class="modal" id="authModal" aria-labelledby="authTitle">
    <div class="modal-head">
      <h3 id="authTitle">लॉग इन</h3>
      <button class="modal-close" type="button" data-close aria-label="बंद करें">×</button>
    </div>
    <div class="modal-body">
      <div class="tabs" id="authTabs" role="tablist">
        <button type="button" data-tab="login" class="active" role="tab">लॉग इन</button>
        <button type="button" data-tab="register" role="tab">पंजीकरण</button>
      </div>
      <div class="alert hidden" id="authAlert" role="alert"></div>

      <form id="loginForm" data-view="login" novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="liEmail">ईमेल <span class="req">*</span></label>
            <input id="liEmail" name="email" type="email" autocomplete="email" required>
          </div>
          <div class="field">
            <label for="liPass">पासवर्ड <span class="req">*</span></label>
            <div class="pw-wrap"><input id="liPass" name="password" type="password" autocomplete="current-password" required><button type="button" class="pw-toggle" aria-pressed="false" aria-label="पासवर्ड दिखाएँ">दिखाएँ</button></div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">लॉग इन करें</button>
          <div style="text-align:center"><button type="button" class="link-btn" data-goto="forgot">पासवर्ड भूल गए?</button></div>
        </div>
      </form>

      <form id="registerForm" data-view="register" class="hidden" novalidate>
        <p class="form-intro">अपने आधिकारिक विवरण देकर पंजीकरण करें — ये विवरण आपकी प्रश्नोत्तरी प्रविष्टियों और भेजी गई रचनाओं के साथ जोड़े जाते हैं।</p>
        <div class="form-grid two">
          <div class="field full">
            <label for="rgName">पूरा नाम <span class="req">*</span></label>
            <input id="rgName" name="full_name" required maxlength="120" autocomplete="name">
          </div>
          <div class="field">
            <label for="rgDesig">पदनाम <span class="req">*</span></label>
            <input id="rgDesig" name="designation" required maxlength="120" placeholder="जैसे प्रबंधक (मानव संसाधन)">
          </div>
          <div class="field">
            <label for="rgEmp">कर्मचारी संख्या</label>
            <input id="rgEmp" name="employee_no" maxlength="40" inputmode="numeric">
          </div>
          <div class="field">
            <label for="rgDept">विभाग <span class="req">*</span></label>
            <input id="rgDept" name="department" required maxlength="120" placeholder="जैसे मानव संसाधन">
          </div>
          <div class="field">
            <label for="rgPost">तैनाती स्थल <span class="req">*</span></label>
            <input id="rgPost" name="place_of_posting" required maxlength="120" placeholder="जैसे MTPS">
          </div>
          <div class="field full">
            <label for="rgEmail">ईमेल <span class="req">*</span></label>
            <input id="rgEmail" name="email" type="email" required autocomplete="email">
          </div>
          <div class="field">
            <label for="rgPass">पासवर्ड <span class="req">*</span></label>
            <div class="pw-wrap"><input id="rgPass" name="password" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="pw-toggle" aria-pressed="false" aria-label="पासवर्ड दिखाएँ">दिखाएँ</button></div>
            <div class="hint"><span>कम से कम 8 अक्षर</span></div>
          </div>
          <div class="field">
            <label for="rgPass2">पासवर्ड की पुष्टि करें <span class="req">*</span></label>
            <div class="pw-wrap"><input id="rgPass2" name="password2" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="pw-toggle" aria-pressed="false" aria-label="पासवर्ड दिखाएँ">दिखाएँ</button></div>
          </div>
          <button class="btn btn-primary btn-block full" type="submit">खाता बनाएँ</button>
        </div>
      </form>

      <form id="forgotForm" data-view="forgot" class="hidden" novalidate>
        <p class="form-intro">अपना पंजीकृत ईमेल पता दर्ज करें। हम आपको पासवर्ड रीसेट करने का लिंक भेजेंगे।</p>
        <div class="form-grid">
          <div class="field">
            <label for="fgEmail">ईमेल <span class="req">*</span></label>
            <input id="fgEmail" name="email" type="email" required autocomplete="email">
          </div>
          <button class="btn btn-primary btn-block" type="submit">रीसेट लिंक भेजें</button>
          <div style="text-align:center"><button type="button" class="link-btn" data-goto="login">← लॉग इन पर लौटें</button></div>
        </div>
      </form>

      <form id="resetForm" data-view="reset" class="hidden" novalidate>
        <p class="form-intro">अपने खाते के लिए नया पासवर्ड चुनें।</p>
        <div class="form-grid">
          <div class="field">
            <label for="rsPass">नया पासवर्ड <span class="req">*</span></label>
            <div class="pw-wrap"><input id="rsPass" name="password" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="pw-toggle" aria-pressed="false" aria-label="पासवर्ड दिखाएँ">दिखाएँ</button></div>
          </div>
          <div class="field">
            <label for="rsPass2">नए पासवर्ड की पुष्टि करें <span class="req">*</span></label>
            <div class="pw-wrap"><input id="rsPass2" name="password2" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="pw-toggle" aria-pressed="false" aria-label="पासवर्ड दिखाएँ">दिखाएँ</button></div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">पासवर्ड अपडेट करें</button>
        </div>
      </form>
    </div>
  </dialog>`;

  let modal, alertBox;
  const TITLES = { login: 'लॉग इन', register: 'अपना खाता बनाएँ', forgot: 'अपना पासवर्ड रीसेट करें', reset: 'नया पासवर्ड सेट करें' };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function showAlert(type, msg) {
    alertBox.className = 'alert alert-' + type;
    alertBox.textContent = msg;
  }
  function hideAlert() { alertBox.className = 'alert hidden'; alertBox.textContent = ''; }

  function showView(view) {
    modal.querySelectorAll('form[data-view]').forEach((f) => f.classList.toggle('hidden', f.dataset.view !== view));
    const tabs = modal.querySelector('#authTabs');
    tabs.classList.toggle('hidden', !(view === 'login' || view === 'register'));
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === view);
      b.setAttribute('aria-selected', b.dataset.tab === view ? 'true' : 'false');
    });
    modal.querySelector('#authTitle').textContent = TITLES[view];
    hideAlert();
  }

  function openAuth(view = 'login', message, type = 'info') {
    if (!modal) return;
    showView(view);
    if (message) showAlert(type, message);
    if (!modal.open) modal.showModal();
    setTimeout(() => modal.querySelector(`form[data-view="${view}"] input`)?.focus(), 60);
  }
  window.openAuth = openAuth;

  function formValues(form) {
    const out = {};
    new FormData(form).forEach((v, k) => { out[k] = /password/.test(k) ? String(v) : String(v).trim(); });
    return out;
  }

  // Password show/hide: flips the input between password and text. The toggles are
  // type="button", so they never submit, never become withBusy's target, and send no form value.
  function setPasswordVisible(btn, visible) {
    const input = btn.parentElement && btn.parentElement.querySelector('input');
    if (!input) return;
    input.type = visible ? 'text' : 'password';
    btn.textContent = visible ? 'छिपाएँ' : 'दिखाएँ';
    btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    btn.setAttribute('aria-label', visible ? 'पासवर्ड छिपाएँ' : 'पासवर्ड दिखाएँ');
  }

  function setupModal() {
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    modal = document.getElementById('authModal');
    alertBox = document.getElementById('authAlert');

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) { modal.close(); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) showView(tab.dataset.tab);
      const go = e.target.closest('[data-goto]');
      if (go) showView(go.dataset.goto);
    });

    // One delegated listener for all five password toggles.
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('.pw-toggle');
      if (btn) setPasswordVisible(btn, btn.getAttribute('aria-pressed') !== 'true');
    });
    // Never leave a password on show once the dialog is dismissed.
    modal.addEventListener('close', () => {
      modal.querySelectorAll('.pw-toggle[aria-pressed="true"]').forEach((b) => setPasswordVisible(b, false));
    });

    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(loginForm);
      if (!EMAIL_RE.test(v.email) || !v.password) return showAlert('error', 'कृपया अपना ईमेल और पासवर्ड दर्ज करें।');
      withBusy(loginForm, async () => {
        const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password });
        if (error) return showAlert('error', friendly(error));
        modal.close();
        loginForm.reset();
        toast('आपका पुनः स्वागत है! आपने लॉग इन कर लिया है।');
      });
    });

    const registerForm = document.getElementById('registerForm');
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(registerForm);
      if (!v.full_name || !v.designation || !v.department || !v.place_of_posting) {
        return showAlert('error', 'कृपया अपना नाम, पदनाम, विभाग और तैनाती स्थल भरें।');
      }
      if (!EMAIL_RE.test(v.email)) return showAlert('error', 'कृपया मान्य ईमेल पता दर्ज करें।');
      if (v.password.length < 8) return showAlert('error', 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।');
      if (v.password !== v.password2) return showAlert('error', 'पासवर्ड मेल नहीं खाते।');
      withBusy(registerForm, async () => {
        const { data, error } = await sb.auth.signUp({
          email: v.email,
          password: v.password,
          options: {
            emailRedirectTo: homeUrl(),
            data: {
              full_name: v.full_name,
              designation: v.designation,
              department: v.department,
              place_of_posting: v.place_of_posting,
              employee_no: v.employee_no
            }
          }
        });
        if (error) return showAlert('error', friendly(error));
        // Supabase returns a user with no identities when the email is already taken.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return showAlert('error', 'इस ईमेल पते से एक खाता पहले से मौजूद है। कृपया लॉग इन करें।');
        }
        registerForm.reset();
        if (data.session) {
          modal.close();
          toast('खाता बन गया — MY DVC – MY VOICE में आपका स्वागत है!');
        } else {
          showView('login');
          document.getElementById('liEmail').value = v.email;
          showAlert('success', `खाता बन गया! हमने ${v.email} पर पुष्टि लिंक भेजा है। उसे खोलें, फिर यहाँ लॉग इन करें।`);
        }
      });
    });

    const forgotForm = document.getElementById('forgotForm');
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(forgotForm);
      if (!EMAIL_RE.test(v.email)) return showAlert('error', 'कृपया मान्य ईमेल पता दर्ज करें।');
      withBusy(forgotForm, async () => {
        const { error } = await sb.auth.resetPasswordForEmail(v.email, { redirectTo: homeUrl() });
        if (error) return showAlert('error', friendly(error));
        showAlert('success', 'यदि इस ईमेल पते से कोई खाता पंजीकृत है, तो उस पते पर रीसेट लिंक भेजा जा रहा है। अपना इनबॉक्स (और स्पैम फ़ोल्डर) देखें।');
      });
    });

    const resetForm = document.getElementById('resetForm');
    resetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(resetForm);
      if (v.password.length < 8) return showAlert('error', 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।');
      if (v.password !== v.password2) return showAlert('error', 'पासवर्ड मेल नहीं खाते।');
      withBusy(resetForm, async () => {
        const { error } = await sb.auth.updateUser({ password: v.password });
        if (error) return showAlert('error', friendly(error));
        resetForm.reset();
        modal.close();
        toast('आपका पासवर्ड अपडेट हो गया है।');
      });
    });

    // Errors returned in the URL by email links (e.g. an expired link)
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('error_description')) {
      const msg = hash.get('error_code') === 'otp_expired'
        ? 'इस ईमेल लिंक की वैधता समाप्त हो चुकी है या इसका उपयोग पहले ही किया जा चुका है। कृपया लॉग इन करें या नया लिंक मँगवाएँ।'
        : hash.get('error_description');
      history.replaceState(null, '', location.pathname + location.search);
      openAuth('login', msg, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setupModal(); renderNav(); });
  } else {
    setupModal();
    renderNav();
  }
})();
