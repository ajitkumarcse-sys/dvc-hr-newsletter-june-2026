// Newsletter page: quiz submission, article submission, and "My profile & submissions".
(function () {
  'use strict';
  const cfg = window.APP_CONFIG;
  const { esc, fmtDate, wordCount, toast, friendly, withBusy, store } = window.UI;
  const Auth = window.Auth;
  const sb = window.sb;
  const EDITION = cfg.QUIZ_EDITION;
  const QUESTIONS = cfg.QUIZ_QUESTIONS;
  const STATUS_LABEL = { pending: 'Under review', shortlisted: 'Shortlisted', not_selected: 'Not selected' };
  const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  function setAlert(el, type, msg) {
    el.className = 'alert alert-' + type;
    el.textContent = msg;
  }
  const clearAlert = (el) => { el.className = 'alert hidden'; el.textContent = ''; };

  // =====================================================================
  // QUIZ
  // =====================================================================
  const quizForm = document.getElementById('quizForm');
  const quizList = document.getElementById('quizList');
  const quizGate = document.getElementById('quizGate');
  const quizAlert = document.getElementById('quizAlert');
  const quizSubmit = document.getElementById('quizSubmit');
  const quizStatus = document.getElementById('quizStatus');
  const QUIZ_DRAFT = 'quizDraft:' + EDITION;

  quizList.innerHTML = QUESTIONS.map((q, i) => `
    <li>
      <span class="q-text">${esc(q)}</span>
      <input class="quiz-input" type="text" maxlength="300" data-q="${i}" autocomplete="off"
             placeholder="Your answer" aria-label="Answer to question ${i + 1}">
    </li>`).join('');
  const quizInputs = [...quizList.querySelectorAll('.quiz-input')];

  const quizDraft = store.get(QUIZ_DRAFT);
  if (Array.isArray(quizDraft)) quizInputs.forEach((inp, i) => { inp.value = quizDraft[i] || ''; });
  quizList.addEventListener('input', () => store.set(QUIZ_DRAFT, quizInputs.map((i) => i.value)));

  const quizState = { loaded: false, open: true, submission: null };

  function renderQuiz() {
    const sub = quizState.submission;
    quizGate.classList.add('hidden');
    quizSubmit.classList.remove('hidden');
    quizStatus.textContent = '';

    if (sub) {
      quizInputs.forEach((inp, i) => { inp.value = sub.answers[i] || ''; inp.readOnly = true; inp.disabled = false; });
      setAlert(quizAlert, 'success', `✅ Your answers were received on ${fmtDate(sub.submitted_at)}. Winners will be featured in the next edition — good luck!`);
      quizSubmit.classList.add('hidden');
      return;
    }
    quizInputs.forEach((inp) => { inp.readOnly = false; inp.disabled = !quizState.open; });
    if (!quizState.open) {
      setAlert(quizAlert, 'info', 'This quiz is closed for new entries. Winners will be announced in the next edition.');
      quizSubmit.classList.add('hidden');
      return;
    }
    if (quizAlert.classList.contains('alert-success') || quizAlert.classList.contains('alert-info')) clearAlert(quizAlert);
    if (!Auth.user) {
      quizGate.classList.remove('hidden');
      quizSubmit.textContent = 'Log in & submit';
      return;
    }
    const p = Auth.profile || {};
    quizSubmit.textContent = 'Submit my answers';
    quizStatus.textContent = `Submitting as ${[p.full_name, p.designation, p.place_of_posting].filter(Boolean).join(' · ')}`;
  }

  async function loadQuiz() {
    const edReq = sb.from('quiz_editions').select('is_open').eq('edition', EDITION).maybeSingle();
    const subReq = Auth.user
      ? sb.from('quiz_submissions').select('answers, submitted_at').eq('edition', EDITION).eq('user_id', Auth.user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [ed, sub] = await Promise.all([edReq, subReq]);
    if (ed.error) console.error(ed.error);
    if (sub.error) console.error(sub.error);
    quizState.open = ed.error ? true : !!ed.data?.is_open;
    quizState.submission = sub.data || null;
    quizState.loaded = true;
    renderQuiz();
  }

  quizForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!Auth.user) {
      window.openAuth('login', 'Log in to submit your quiz answers — what you have typed is kept on this device.');
      return;
    }
    if (quizState.submission || !quizState.open) return;
    const answers = quizInputs.map((i) => i.value.trim());
    const filled = answers.filter(Boolean).length;
    if (!filled) { setAlert(quizAlert, 'error', 'Please answer at least one question before submitting.'); return; }
    const blanks = answers.length - filled;
    const prompt = blanks
      ? `You have left ${blanks} question${blanks > 1 ? 's' : ''} blank.\n\nYou can submit only once. Submit anyway?`
      : 'Submit your answers now? You can submit only once.';
    if (!window.confirm(prompt)) return;

    withBusy(quizForm, async () => {
      const { data, error } = await sb.from('quiz_submissions')
        .insert({ edition: EDITION, answers })
        .select('answers, submitted_at')
        .single();
      if (error) {
        if (error.code === '23505') setAlert(quizAlert, 'error', 'You have already submitted answers for this quiz.');
        else if (error.code === '42501') setAlert(quizAlert, 'error', 'This quiz is no longer accepting entries.');
        else { setAlert(quizAlert, 'error', friendly(error)); return; }
        await loadQuiz();
        return;
      }
      quizState.submission = data;
      store.del(QUIZ_DRAFT);
      renderQuiz();
      quizAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('🎉 Your quiz answers have been submitted. Good luck!');
    });
  });

  // =====================================================================
  // ARTICLE SUBMISSION
  // =====================================================================
  const artForm = document.getElementById('articleForm');
  const artGate = document.getElementById('articleGate');
  const artAlert = document.getElementById('articleAlert');
  const artContent = document.getElementById('artContent');
  const wordCountEl = document.getElementById('wordCount');
  const artStatus = document.getElementById('articleStatus');
  const ART_DRAFT = 'articleDraft';
  const DRAFT_FIELDS = ['title', 'category', 'language', 'content'];

  function updateWordCount() {
    const n = wordCount(artContent.value);
    wordCountEl.textContent = `${n} / ${cfg.MAX_WORDS} words`;
    wordCountEl.classList.toggle('over', n > cfg.MAX_WORDS);
  }

  const artDraft = store.get(ART_DRAFT);
  if (artDraft && typeof artDraft === 'object') {
    DRAFT_FIELDS.forEach((f) => { if (artDraft[f]) artForm.elements[f].value = artDraft[f]; });
  }
  updateWordCount();
  artForm.addEventListener('input', (e) => {
    if (e.target === artContent) updateWordCount();
    if (DRAFT_FIELDS.includes(e.target.name)) {
      store.set(ART_DRAFT, Object.fromEntries(DRAFT_FIELDS.map((f) => [f, artForm.elements[f].value])));
    }
  });

  function validateImage(f) {
    if (!IMAGE_TYPES[f.type]) return 'Photos must be JPG, PNG or WebP images.';
    if (f.size > cfg.MAX_PHOTO_MB * 1024 * 1024) return `Each photo must be ${cfg.MAX_PHOTO_MB} MB or smaller.`;
    return null;
  }

  function bindPreview(inputId, imgId) {
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    input.addEventListener('change', () => {
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      const f = input.files[0];
      if (!f) { img.classList.add('hidden'); return; }
      const err = validateImage(f);
      if (err) { setAlert(artAlert, 'error', err); input.value = ''; img.classList.add('hidden'); return; }
      img.dataset.url = URL.createObjectURL(f);
      img.src = img.dataset.url;
      img.classList.remove('hidden');
    });
    return () => { input.value = ''; img.classList.add('hidden'); img.removeAttribute('src'); };
  }
  const resetPhoto = bindPreview('artPhoto', 'artPhotoPrev');
  const resetAuthorPhoto = bindPreview('artAuthorPhoto', 'artAuthorPhotoPrev');

  async function uploadPhoto(file, kind) {
    const path = `${Auth.user.id}/${Date.now()}-${kind}-${Math.random().toString(36).slice(2, 8)}.${IMAGE_TYPES[file.type]}`;
    const { error } = await sb.storage.from(cfg.PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  function renderArticle() {
    artGate.classList.toggle('hidden', !Auth.ready || !!Auth.user);
    const p = Auth.profile;
    artStatus.textContent = Auth.user && p
      ? `Submitting as ${[p.full_name, p.designation, p.department, p.place_of_posting].filter(Boolean).join(' · ')}`
      : '';
  }

  artForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!Auth.user) {
      window.openAuth('login', 'Log in to submit your article — your draft is kept on this device.');
      return;
    }
    const el = artForm.elements;
    const title = el.title.value.trim();
    const category = el.category.value;
    const language = el.language.value;
    const content = el.content.value.trim();
    const photo = el.photo.files[0];
    const authorPhoto = el.author_photo.files[0];

    if (title.length < 3) return setAlert(artAlert, 'error', 'Please add a title (at least 3 characters).');
    if (!category) return setAlert(artAlert, 'error', 'Please choose a category.');
    if (!content) return setAlert(artAlert, 'error', 'Please write your article.');
    const n = wordCount(content);
    if (n > cfg.MAX_WORDS) return setAlert(artAlert, 'error', `Your article is ${n} words — please keep it within ${cfg.MAX_WORDS} words.`);
    for (const f of [photo, authorPhoto]) {
      const err = f && validateImage(f);
      if (err) return setAlert(artAlert, 'error', err);
    }
    if (!el.consent.checked) return setAlert(artAlert, 'error', 'Please confirm the declaration before submitting.');

    withBusy(artForm, async () => {
      const uploaded = [];
      try {
        const photo_path = photo ? await uploadPhoto(photo, 'photo') : null;
        if (photo_path) uploaded.push(photo_path);
        const author_photo_path = authorPhoto ? await uploadPhoto(authorPhoto, 'author') : null;
        if (author_photo_path) uploaded.push(author_photo_path);
        const { error } = await sb.from('article_submissions')
          .insert({ title, category, language, content, photo_path, author_photo_path });
        if (error) throw error;
      } catch (err) {
        console.error(err);
        if (uploaded.length) await sb.storage.from(cfg.PHOTO_BUCKET).remove(uploaded);
        setAlert(artAlert, 'error', friendly(err));
        return;
      }
      artForm.reset();
      resetPhoto();
      resetAuthorPhoto();
      store.del(ART_DRAFT);
      updateWordCount();
      setAlert(artAlert, 'success', `🎉 Thank you! “${title}” has been sent to the Editorial Team. Track its status under “My profile & submissions”.`);
      artAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Article submitted successfully!');
    });
  });

  // =====================================================================
  // MY PROFILE & SUBMISSIONS
  // =====================================================================
  const acct = document.getElementById('accountModal');
  const profileForm = document.getElementById('profileForm');
  const acctAlert = document.getElementById('acctAlert');
  const myArticles = document.getElementById('myArticles');
  const myQuiz = document.getElementById('myQuiz');
  const PROFILE_FIELDS = ['full_name', 'employee_no', 'designation', 'department', 'place_of_posting'];

  acct.addEventListener('click', (e) => {
    if (e.target === acct || e.target.closest('[data-close]')) acct.close();
  });

  async function loadMySubmissions() {
    myArticles.innerHTML = '<div class="loading">Loading…</div>';
    myQuiz.innerHTML = '';
    const uid = Auth.user.id;
    const [arts, quiz] = await Promise.all([
      sb.from('article_submissions')
        .select('id, title, category, language, status, editor_note, created_at')
        .eq('user_id', uid).order('created_at', { ascending: false }),
      sb.from('quiz_submissions')
        .select('edition, answers, submitted_at')
        .eq('user_id', uid).order('submitted_at', { ascending: false })
    ]);

    if (arts.error) myArticles.innerHTML = `<div class="alert alert-error">${esc(friendly(arts.error))}</div>`;
    else if (!arts.data.length) myArticles.innerHTML = '<div class="empty">No articles yet. <a href="#submit" data-close>Submit your first one →</a></div>';
    else {
      myArticles.innerHTML = arts.data.map((a) => `
        <div class="sub-item">
          <div class="top">
            <div><b>${esc(a.title)}</b>
              <div class="meta">${esc(a.category)} · ${esc(a.language)} · Submitted ${esc(fmtDate(a.created_at))}</div></div>
            <span class="status ${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
          </div>
          ${a.editor_note ? `<div class="note"><b>Note from the Editorial Team:</b> ${esc(a.editor_note)}</div>` : ''}
        </div>`).join('');
    }

    if (quiz.error) myQuiz.innerHTML = `<div class="alert alert-error">${esc(friendly(quiz.error))}</div>`;
    else if (!quiz.data.length) myQuiz.innerHTML = '<div class="empty">You have not taken part in a quiz yet. <a href="#quiz" data-close>Take this month\'s quiz →</a></div>';
    else {
      myQuiz.innerHTML = quiz.data.map((q) => `
        <div class="sub-item">
          <div class="top">
            <div><b>Quiz — ${esc(q.edition)}</b><div class="meta">Submitted ${esc(fmtDate(q.submitted_at))}</div></div>
            <span class="status shortlisted">Received</span>
          </div>
          <details><summary>View my answers</summary>
            <ol>${q.answers.map((ans) => `<li>${esc(ans) || '<span class="muted">— left blank —</span>'}</li>`).join('')}</ol>
          </details>
        </div>`).join('');
    }
  }

  window.openAccount = function () {
    if (!Auth.user) { window.openAuth('login', 'Log in to see your profile and submissions.'); return; }
    const p = Auth.profile || {};
    PROFILE_FIELDS.forEach((f) => { profileForm.elements[f].value = p[f] || ''; });
    profileForm.elements.email.value = Auth.user.email || '';
    clearAlert(acctAlert);
    if (!acct.open) acct.showModal();
    loadMySubmissions();
  };

  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, profileForm.elements[f].value.trim()]));
    if (!v.full_name || !v.designation || !v.department || !v.place_of_posting) {
      return setAlert(acctAlert, 'error', 'Name, designation, department and place of posting are required.');
    }
    v.employee_no = v.employee_no || null;
    withBusy(profileForm, async () => {
      const { error } = await sb.from('profiles').update(v).eq('id', Auth.user.id);
      if (error) return setAlert(acctAlert, 'error', friendly(error));
      await Auth.reloadProfile();
      setAlert(acctAlert, 'success', 'Your profile has been updated.');
    });
  });

  // =====================================================================
  // WIRING
  // =====================================================================
  if (Auth.unavailable) {
    const msg = 'Online submissions are temporarily unavailable. Please email your entry to dvchrnewsletter@gmail.com.';
    setAlert(quizAlert, 'error', msg);
    setAlert(artAlert, 'error', msg);
    quizSubmit.disabled = true;
    artForm.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  let accountHashHandled = false;
  Auth.onChange(() => {
    loadQuiz();
    renderArticle();
    if (!Auth.user && acct.open) acct.close();
    if (!accountHashHandled && location.hash === '#account') {
      accountHashHandled = true;
      history.replaceState(null, '', location.pathname + location.search);
      window.openAccount();
    }
  });
})();
