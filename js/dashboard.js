// Editor dashboard: review articles, see quiz entries (fastest first), manage quiz editions, list members.
(function () {
  'use strict';
  const cfg = window.APP_CONFIG;
  const { esc, fmtDate, wordCount, toast, friendly } = window.UI;
  const Auth = window.Auth;
  const sb = window.sb;
  const STATUS_LABEL = { pending: 'समीक्षाधीन', shortlisted: 'शॉर्टलिस्ट', not_selected: 'चयनित नहीं' };
  // Display labels only: the database keeps the English values, which filters and comparisons still use.
  const CATEGORY_LABEL = { 'Article': 'लेख', 'Achievement': 'उपलब्धि', 'Poem / Creative': 'कविता / सृजनात्मक लेखन', 'Photograph': 'छायाचित्र', 'Station News': 'स्टेशन समाचार', 'Feedback / Suggestion': 'प्रतिक्रिया / सुझाव' };
  const LANGUAGE_LABEL = { English: 'अंग्रेज़ी', Hindi: 'हिंदी' };
  const ROLE_LABEL = { employee: 'कर्मचारी', editor: 'संपादक' };
  const $ = (id) => document.getElementById(id);

  const gate = $('dashGate');
  const app = $('dashApp');
  const state = {
    loadedFor: null,
    articles: [],
    photoUrls: {},
    editions: [],
    quizEdition: cfg.QUIZ_EDITION,
    quizEntries: [],
    members: []
  };

  // ---------- CSV ----------
  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function downloadCSV(filename, rows) {
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM keeps Hindi intact in Excel
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const person = (p) => [p?.full_name, p?.designation, p?.department, p?.place_of_posting, p?.employee_no, p?.email];

  // ---------- Access gate ----------
  function showGate(html) {
    gate.innerHTML = html;
    gate.classList.remove('hidden');
    app.classList.add('hidden');
  }

  Auth.onChange(() => {
    if (Auth.unavailable) {
      return showGate('<div class="gate-ico" data-icon="warning" aria-hidden="true"></div><h2>सेवा उपलब्ध नहीं</h2><p class="muted">लॉग इन सेवा लोड नहीं हो सकी। कृपया अपना इंटरनेट कनेक्शन जाँचें और पृष्ठ रिफ़्रेश करें।</p>');
    }
    if (!Auth.user) {
      state.loadedFor = null;
      return showGate(`<div class="gate-ico" data-icon="lock" aria-hidden="true"></div><h2>केवल संपादकों के लिए</h2>
        <p class="muted">प्राप्त रचनाओं और प्रश्नोत्तरी प्रविष्टियों की समीक्षा के लिए संपादक खाते से लॉग इन करें।</p>
        <button class="btn btn-primary" type="button" data-open-auth="login">लॉग इन करें</button>`);
    }
    if (!Auth.isEditor) {
      return showGate(`<div class="gate-ico" data-icon="block" aria-hidden="true"></div><h2>संपादक पहुँच उपलब्ध नहीं</h2>
        <p class="muted">आपका खाता (${esc(Auth.user.email)}) संपादकों की सूची में नहीं है। अपना ईमेल जुड़वाने के लिए समाचार पत्रिका प्रशासक से अनुरोध करें, फिर यह पृष्ठ रिफ़्रेश करें।</p>
        <a class="btn btn-secondary" href="index.html">← समाचार पत्रिका पर लौटें</a>`);
    }
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    if (state.loadedFor !== Auth.user.id) {
      state.loadedFor = Auth.user.id;
      loadAll();
    }
  });

  function loadAll() {
    return Promise.all([loadArticles(), loadEditions().then(loadQuizEntries), loadMembers()]);
  }

  function renderStats() {
    $('sTotal').textContent = state.articles.length;
    $('sPending').textContent = state.articles.filter((a) => a.status === 'pending').length;
    $('sQuiz').textContent = state.quizEntries.length;
    $('sQuizLabel').textContent = `प्रश्नोत्तरी प्रविष्टियाँ · ${state.quizEdition}`;
    $('sMembers').textContent = state.members.length;
    $('articleCount').textContent = state.articles.length;
    $('quizCount').textContent = state.quizEntries.length;
    $('memberCount').textContent = state.members.length;
  }

  // ---------- Tabs ----------
  document.querySelector('.dash-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    document.querySelectorAll('.dash-tabs [data-tab]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.dash-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + btn.dataset.tab));
  });
  $('refreshBtn').addEventListener('click', async () => {
    const b = $('refreshBtn');
    b.disabled = true;
    await loadAll();
    b.disabled = false;
    toast('डैशबोर्ड रिफ़्रेश हो गया।');
  });

  // =====================================================================
  // ARTICLES
  // =====================================================================
  const articleList = $('articleList');
  const fStatus = $('fStatus');
  const fCategory = $('fCategory');
  const fSearch = $('fSearch');

  async function loadArticles() {
    articleList.innerHTML = '<div class="loading">प्रविष्टियाँ लोड हो रही हैं…</div>';
    const { data, error } = await sb.from('article_submissions')
      .select(`*,
        author:profiles!article_submissions_user_id_fkey(full_name, email, employee_no, designation, department, place_of_posting),
        reviewer:profiles!article_submissions_reviewed_by_fkey(full_name)`)
      .order('created_at', { ascending: false });
    if (error) { articleList.innerHTML = `<div class="alert alert-error">${esc(friendly(error))}</div>`; return; }
    state.articles = data;

    state.photoUrls = {};
    const paths = data.flatMap((a) => [a.photo_path, a.author_photo_path]).filter(Boolean);
    if (paths.length) {
      const { data: signed, error: sErr } = await sb.storage.from(cfg.PHOTO_BUCKET).createSignedUrls(paths, 3600);
      if (sErr) console.error(sErr);
      (signed || []).forEach((s) => { if (s.signedUrl) state.photoUrls[s.path] = s.signedUrl; });
    }
    renderArticles();
    renderStats();
  }

  function filteredArticles() {
    const st = fStatus.value;
    const cat = fCategory.value;
    const q = fSearch.value.trim().toLowerCase();
    return state.articles.filter((a) => (!st || a.status === st)
      && (!cat || a.category === cat)
      && (!q || [a.title, a.content, a.author?.full_name, a.author?.department, a.author?.place_of_posting]
        .join(' ').toLowerCase().includes(q)));
  }

  function renderArticles() {
    const rows = filteredArticles();
    if (!state.articles.length) { articleList.innerHTML = '<div class="empty">अभी तक कोई रचना प्राप्त नहीं हुई है।</div>'; return; }
    if (!rows.length) { articleList.innerHTML = '<div class="empty">इन फ़िल्टरों के अनुरूप कोई प्रविष्टि नहीं मिली।</div>'; return; }
    articleList.innerHTML = rows.map((a) => {
      const au = a.author || {};
      const photos = [['photo_path', 'रचना की फ़ोटो'], ['author_photo_path', 'रचनाकार की फ़ोटो']]
        .filter(([k]) => a[k] && state.photoUrls[a[k]])
        .map(([k, label]) => `<figure>
            <a href="${esc(state.photoUrls[a[k]])}" target="_blank" rel="noopener"><img src="${esc(state.photoUrls[a[k]])}" alt="${label}" loading="lazy"></a>
            <figcaption>${label}</figcaption></figure>`).join('');
      const authorBits = [au.designation, au.department, au.place_of_posting, au.employee_no && 'कर्मचारी सं. ' + au.employee_no]
        .filter(Boolean).map(esc).join(' · ');
      return `
      <article class="art-card" data-id="${esc(a.id)}">
        <div class="head">
          <div>
            <h3>${esc(a.title)}</h3>
            <div class="author"><b>${esc(au.full_name || 'अज्ञात')}</b>${authorBits ? ' · ' + authorBits : ''}
              ${au.email ? ` · <a href="mailto:${esc(au.email)}">${esc(au.email)}</a>` : ''}</div>
            <div class="tags">
              <span class="tag-chip">${esc(CATEGORY_LABEL[a.category] || a.category)}</span>
              <span class="tag-chip">${esc(LANGUAGE_LABEL[a.language] || a.language)}</span>
              <span class="tag-chip">${wordCount(a.content)} शब्द</span>
              <span class="tag-chip">${esc(fmtDate(a.created_at))}</span>
            </div>
          </div>
          <span class="status ${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
        </div>
        <div class="content">${esc(a.content)}</div>
        ${photos ? `<div class="photos">${photos}</div>` : ''}
        <div class="review-row">
          <select data-field="status" aria-label="समीक्षा स्थिति">
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}"${a.status === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <input data-field="note" type="text" maxlength="1000" value="${esc(a.editor_note || '')}"
                 placeholder="रचनाकार के लिए टिप्पणी (वैकल्पिक — यह उन्हें दिखाई देगी)" aria-label="रचनाकार के लिए टिप्पणी">
          <button class="btn btn-primary btn-sm" type="button" data-review="save">सहेजें</button>
        </div>
        ${a.reviewed_at ? `<div class="review-meta">अंतिम समीक्षा: ${esc(fmtDate(a.reviewed_at))}${a.reviewer?.full_name ? ' (' + esc(a.reviewer.full_name) + ' द्वारा)' : ''}</div>` : ''}
      </article>`;
    }).join('');
  }

  [fStatus, fCategory].forEach((el) => el.addEventListener('change', renderArticles));
  fSearch.addEventListener('input', renderArticles);

  articleList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-review="save"]');
    if (!btn) return;
    const card = btn.closest('.art-card');
    const id = card.dataset.id;
    const status = card.querySelector('[data-field="status"]').value;
    const editor_note = card.querySelector('[data-field="note"]').value.trim() || null;
    btn.disabled = true;
    btn.textContent = 'सहेजा जा रहा है…';
    const { data, error } = await sb.from('article_submissions')
      .update({ status, editor_note }).eq('id', id)
      .select('status, editor_note, reviewed_at')
      .single();
    btn.disabled = false;
    btn.textContent = 'सहेजें';
    if (error) { toast(friendly(error), 'error'); return; }
    const a = state.articles.find((x) => x.id === id);
    Object.assign(a, data, { reviewer: { full_name: Auth.profile?.full_name } });
    renderArticles();
    renderStats();
    toast(`सहेजा गया — स्थिति “${STATUS_LABEL[status]}” कर दी गई।`);
  });

  $('exportArticles').addEventListener('click', () => {
    const rows = filteredArticles();
    if (!rows.length) { toast('निर्यात के लिए कुछ नहीं है।', 'error'); return; }
    downloadCSV(`article-submissions-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['भेजने का समय (भा.मा.स.)', 'शीर्षक', 'श्रेणी', 'भाषा', 'शब्द', 'स्थिति', 'संपादक की टिप्पणी',
        'नाम', 'पदनाम', 'विभाग', 'तैनाती स्थल', 'कर्मचारी संख्या', 'ईमेल', 'सामग्री'],
      ...rows.map((a) => [fmtDate(a.created_at), a.title, CATEGORY_LABEL[a.category] || a.category, LANGUAGE_LABEL[a.language] || a.language, wordCount(a.content),
        STATUS_LABEL[a.status], a.editor_note, ...person(a.author), a.content])
    ]);
  });

  // =====================================================================
  // QUIZ
  // =====================================================================
  const qEdition = $('qEdition');
  const qOpen = $('qOpen');
  const quizTable = $('quizTable');

  async function loadEditions() {
    const { data, error } = await sb.from('quiz_editions').select('*').order('edition', { ascending: false });
    if (error) { toast(friendly(error), 'error'); return; }
    state.editions = data;
    if (data.length && !data.some((ed) => ed.edition === state.quizEdition)) state.quizEdition = data[0].edition;
    qEdition.innerHTML = data.map((ed) => `<option value="${esc(ed.edition)}"${ed.edition === state.quizEdition ? ' selected' : ''}>
      ${esc(ed.edition)}${ed.is_open ? '' : ' (बंद)'}</option>`).join('');
    renderEditionToggle();
  }

  function renderEditionToggle() {
    const ed = state.editions.find((x) => x.edition === state.quizEdition);
    qOpen.checked = !!ed?.is_open;
    qOpen.disabled = !ed;
    $('qOpenState').className = 'status ' + (ed?.is_open ? 'open' : 'closed');
    $('qOpenState').textContent = ed?.is_open ? 'खुला' : 'बंद';
  }

  async function loadQuizEntries() {
    quizTable.innerHTML = '<div class="loading">प्रविष्टियाँ लोड हो रही हैं…</div>';
    const { data, error } = await sb.from('quiz_submissions')
      .select('answers, submitted_at, user:profiles(full_name, email, employee_no, designation, department, place_of_posting)')
      .eq('edition', state.quizEdition)
      .order('submitted_at', { ascending: true });
    if (error) { quizTable.innerHTML = `<div class="alert alert-error">${esc(friendly(error))}</div>`; return; }
    state.quizEntries = data;
    renderQuizEntries();
    renderStats();
  }

  function questionsFor(edition) {
    return edition === cfg.QUIZ_EDITION ? cfg.QUIZ_QUESTIONS : [];
  }

  function renderQuizEntries() {
    const entries = state.quizEntries;
    if (!entries.length) { quizTable.innerHTML = '<div class="empty">इस संस्करण के लिए अभी तक कोई प्रविष्टि नहीं आई है।</div>'; return; }
    const qs = questionsFor(state.quizEdition);
    const n = Math.max(qs.length, ...entries.map((e) => e.answers.length));
    const qHeads = Array.from({ length: n }, (_, i) => `<th title="${esc(qs[i] || '')}">प्रश्न ${i + 1}</th>`).join('');
    quizTable.innerHTML = `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>#</th><th>नाम</th><th>पदनाम</th><th>विभाग</th><th>तैनाती</th><th>जमा करने का समय (भा.मा.स.)</th>${qHeads}</tr></thead>
        <tbody>${entries.map((e, idx) => `
          <tr>
            <td class="rank">${idx + 1}</td>
            <td class="nowrap"><b>${esc(e.user?.full_name)}</b><br><span class="muted">${esc(e.user?.email)}</span></td>
            <td>${esc(e.user?.designation)}</td>
            <td>${esc(e.user?.department)}</td>
            <td>${esc(e.user?.place_of_posting)}</td>
            <td class="nowrap">${esc(fmtDate(e.submitted_at))}</td>
            ${Array.from({ length: n }, (_, i) => `<td class="ans">${esc(e.answers[i] || '') || '<span class="muted">—</span>'}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }

  qEdition.addEventListener('change', () => {
    state.quizEdition = qEdition.value;
    renderEditionToggle();
    loadQuizEntries();
  });

  qOpen.addEventListener('change', async () => {
    const want = qOpen.checked;
    const { error } = await sb.from('quiz_editions').update({ is_open: want }).eq('edition', state.quizEdition);
    if (error) { qOpen.checked = !want; toast(friendly(error), 'error'); return; }
    const ed = state.editions.find((x) => x.edition === state.quizEdition);
    if (ed) ed.is_open = want;
    await loadEditions();
    toast(want ? 'प्रश्नोत्तरी फिर से खोल दी गई — प्रविष्टियाँ स्वीकार की जा रही हैं।' : 'प्रश्नोत्तरी बंद कर दी गई — अब कोई नई प्रविष्टि स्वीकार नहीं की जाएगी।');
  });

  $('exportQuiz').addEventListener('click', () => {
    const entries = state.quizEntries;
    if (!entries.length) { toast('निर्यात के लिए कुछ नहीं है।', 'error'); return; }
    const qs = questionsFor(state.quizEdition);
    const n = Math.max(qs.length, ...entries.map((e) => e.answers.length));
    downloadCSV(`quiz-entries-${state.quizEdition}.csv`, [
      ['क्रम (समय के अनुसार)', 'जमा करने का समय (भा.मा.स.)', 'नाम', 'पदनाम', 'विभाग', 'तैनाती स्थल', 'कर्मचारी संख्या', 'ईमेल',
        ...Array.from({ length: n }, (_, i) => `प्रश्न ${i + 1}${qs[i] ? ': ' + qs[i] : ''}`)],
      ...entries.map((e, idx) => [idx + 1, fmtDate(e.submitted_at), ...person(e.user),
        ...Array.from({ length: n }, (_, i) => e.answers[i] || '')])
    ]);
  });

  $('newEditionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const edition = $('neEdition').value.trim();
    const title = $('neTitle').value.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(edition)) { toast('YYYY-MM प्रारूप का प्रयोग करें, जैसे 2026-07।', 'error'); return; }
    const { error } = await sb.from('quiz_editions').insert({ edition, title, is_open: true });
    if (error) {
      toast(error.code === '23505' ? `संस्करण ${edition} पहले से मौजूद है।` : friendly(error), 'error');
      return;
    }
    e.target.reset();
    state.quizEdition = edition;
    await loadEditions();
    await loadQuizEntries();
    toast(`प्रश्नोत्तरी संस्करण ${edition} बनाकर खोल दिया गया है। js/config.js में प्रश्न अपडेट करना न भूलें।`);
  });

  // =====================================================================
  // MEMBERS
  // =====================================================================
  const mSearch = $('mSearch');
  const memberTable = $('memberTable');

  async function loadMembers() {
    memberTable.innerHTML = '<div class="loading">सदस्य लोड हो रहे हैं…</div>';
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { memberTable.innerHTML = `<div class="alert alert-error">${esc(friendly(error))}</div>`; return; }
    state.members = data;
    renderMembers();
    renderStats();
  }

  function filteredMembers() {
    const q = mSearch.value.trim().toLowerCase();
    return state.members.filter((m) => !q || [m.full_name, m.email, m.designation, m.department, m.place_of_posting, m.employee_no]
      .join(' ').toLowerCase().includes(q));
  }

  function renderMembers() {
    const rows = filteredMembers();
    if (!state.members.length) { memberTable.innerHTML = '<div class="empty">अभी तक कोई सदस्य पंजीकृत नहीं है।</div>'; return; }
    if (!rows.length) { memberTable.innerHTML = '<div class="empty">आपकी खोज से मेल खाता कोई सदस्य नहीं मिला।</div>'; return; }
    memberTable.innerHTML = `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>नाम</th><th>ईमेल</th><th>कर्मचारी सं.</th><th>पदनाम</th><th>विभाग</th><th>तैनाती</th><th>भूमिका</th><th>पंजीकरण तिथि</th></tr></thead>
        <tbody>${rows.map((m) => `
          <tr>
            <td class="nowrap"><b>${esc(m.full_name)}</b></td>
            <td>${esc(m.email)}</td>
            <td>${esc(m.employee_no)}</td>
            <td>${esc(m.designation)}</td>
            <td>${esc(m.department)}</td>
            <td>${esc(m.place_of_posting)}</td>
            <td>${m.role === 'editor' ? '<span class="role-badge" style="margin:0">संपादक</span>' : 'कर्मचारी'}</td>
            <td class="nowrap">${esc(fmtDate(m.created_at, false))}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }

  mSearch.addEventListener('input', renderMembers);
  $('exportMembers').addEventListener('click', () => {
    const rows = filteredMembers();
    if (!rows.length) { toast('निर्यात के लिए कुछ नहीं है।', 'error'); return; }
    downloadCSV(`members-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['नाम', 'पदनाम', 'विभाग', 'तैनाती स्थल', 'कर्मचारी संख्या', 'ईमेल', 'भूमिका', 'पंजीकरण तिथि'],
      ...rows.map((m) => [...person(m), ROLE_LABEL[m.role] || m.role, fmtDate(m.created_at, false)])
    ]);
  });
})();
