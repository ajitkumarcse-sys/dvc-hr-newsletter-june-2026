// Newsletter page: quiz submission, article submission, and "My profile & submissions".
(function () {
  'use strict';
  const cfg = window.APP_CONFIG;
  const { esc, fmtDate, wordCount, toast, friendly, withBusy, store } = window.UI;
  const Auth = window.Auth;
  const sb = window.sb;
  const EDITION = cfg.QUIZ_EDITION;
  const QUESTIONS = cfg.QUIZ_QUESTIONS;
  const STATUS_LABEL = { pending: 'समीक्षाधीन', shortlisted: 'शॉर्टलिस्ट', not_selected: 'चयनित नहीं' };
  // Display-only labels: the database stores the English values (a.category / a.language).
  const CATEGORY_LABEL = { 'Article': 'लेख', 'Achievement': 'उपलब्धि', 'Poem / Creative': 'कविता / सृजनात्मक लेखन', 'Photograph': 'छायाचित्र', 'Station News': 'स्टेशन समाचार', 'Feedback / Suggestion': 'प्रतिक्रिया / सुझाव' };
  const LANGUAGE_LABEL = { English: 'अंग्रेज़ी', Hindi: 'हिंदी' };
  const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  // Jump instead of gliding when the reader (OS setting) or the site switch asks for reduced motion.
  const scrollBehavior = () => ((document.documentElement.getAttribute('data-motion') === 'reduce'
    || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) ? 'auto' : 'smooth');

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
             placeholder="आपका उत्तर" aria-label="प्रश्न ${i + 1} का उत्तर">
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
      setAlert(quizAlert, 'success', `आपके उत्तर ${fmtDate(sub.submitted_at)} को प्राप्त हुए। विजेताओं के नाम अगले अंक में प्रकाशित किए जाएँगे — शुभकामनाएँ!`);
      quizSubmit.classList.add('hidden');
      return;
    }
    quizInputs.forEach((inp) => { inp.readOnly = false; inp.disabled = !quizState.open; });
    if (!quizState.open) {
      setAlert(quizAlert, 'info', 'यह प्रश्नोत्तरी नई प्रविष्टियों के लिए बंद हो चुकी है। विजेताओं के नाम अगले अंक में घोषित किए जाएँगे।');
      quizSubmit.classList.add('hidden');
      return;
    }
    if (quizAlert.classList.contains('alert-success') || quizAlert.classList.contains('alert-info')) clearAlert(quizAlert);
    if (!Auth.user) {
      quizGate.classList.remove('hidden');
      quizSubmit.textContent = 'लॉग इन करके जमा करें';
      return;
    }
    const p = Auth.profile || {};
    quizSubmit.textContent = 'मेरे उत्तर जमा करें';
    quizStatus.textContent = `इस नाम से जमा किया जा रहा है: ${[p.full_name, p.designation, p.place_of_posting].filter(Boolean).join(' · ')}`;
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
      window.openAuth('login', 'प्रश्नोत्तरी के उत्तर जमा करने के लिए लॉग इन करें — आपने जो लिखा है, वह इसी डिवाइस पर सुरक्षित रहता है।');
      return;
    }
    if (quizState.submission || !quizState.open) return;
    const answers = quizInputs.map((i) => i.value.trim());
    const filled = answers.filter(Boolean).length;
    if (!filled) { setAlert(quizAlert, 'error', 'जमा करने से पहले कृपया कम से कम एक प्रश्न का उत्तर दें।'); return; }
    const blanks = answers.length - filled;
    const prompt = blanks
      ? `आपने ${blanks} प्रश्न खाली ${blanks > 1 ? 'छोड़े हैं' : 'छोड़ा है'}।\n\nआप केवल एक बार जमा कर सकते हैं। फिर भी जमा करें?`
      : 'अपने उत्तर अभी जमा करें? आप केवल एक बार जमा कर सकते हैं।';
    if (!window.confirm(prompt)) return;

    withBusy(quizForm, async () => {
      const { data, error } = await sb.from('quiz_submissions')
        .insert({ edition: EDITION, answers })
        .select('answers, submitted_at')
        .single();
      if (error) {
        if (error.code === '23505') setAlert(quizAlert, 'error', 'इस प्रश्नोत्तरी के लिए आपके उत्तर पहले ही जमा हो चुके हैं।');
        else if (error.code === '42501') setAlert(quizAlert, 'error', 'इस प्रश्नोत्तरी में अब प्रविष्टियाँ स्वीकार नहीं की जा रही हैं।');
        else { setAlert(quizAlert, 'error', friendly(error)); return; }
        await loadQuiz();
        return;
      }
      quizState.submission = data;
      store.del(QUIZ_DRAFT);
      renderQuiz();
      quizAlert.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      toast('प्रश्नोत्तरी के लिए आपके उत्तर जमा हो गए हैं। शुभकामनाएँ!');
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
    wordCountEl.textContent = `${n} / ${cfg.MAX_WORDS} शब्द`;
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
    if (!IMAGE_TYPES[f.type]) return 'फ़ोटो JPG, PNG या WebP प्रारूप में होनी चाहिए।';
    if (f.size > cfg.MAX_PHOTO_MB * 1024 * 1024) return `प्रत्येक फ़ोटो का आकार अधिकतम ${cfg.MAX_PHOTO_MB} MB होना चाहिए।`;
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
      ? `इस नाम से भेजा जा रहा है: ${[p.full_name, p.designation, p.department, p.place_of_posting].filter(Boolean).join(' · ')}`
      : '';
  }

  artForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!Auth.user) {
      window.openAuth('login', 'अपनी रचना भेजने के लिए लॉग इन करें — आपका मसौदा इसी डिवाइस पर सुरक्षित रहता है।');
      return;
    }
    const el = artForm.elements;
    const title = el.title.value.trim();
    const category = el.category.value;
    const language = el.language.value;
    const content = el.content.value.trim();
    const photo = el.photo.files[0];
    const authorPhoto = el.author_photo.files[0];

    if (title.length < 3) return setAlert(artAlert, 'error', 'कृपया शीर्षक लिखें (कम से कम 3 अक्षर)।');
    if (!category) return setAlert(artAlert, 'error', 'कृपया श्रेणी चुनें।');
    if (!content) return setAlert(artAlert, 'error', 'कृपया अपनी रचना लिखें।');
    const n = wordCount(content);
    if (n > cfg.MAX_WORDS) return setAlert(artAlert, 'error', `आपकी रचना ${n} शब्दों की है — कृपया इसे ${cfg.MAX_WORDS} शब्दों के भीतर रखें।`);
    for (const f of [photo, authorPhoto]) {
      const err = f && validateImage(f);
      if (err) return setAlert(artAlert, 'error', err);
    }
    if (!el.consent.checked) return setAlert(artAlert, 'error', 'भेजने से पहले कृपया घोषणा की पुष्टि करें।');

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
      setAlert(artAlert, 'success', `धन्यवाद! “${title}” संपादक मंडल को भेज दी गई है। इसकी स्थिति “मेरी प्रोफ़ाइल और प्रविष्टियाँ” में देखें।`);
      artAlert.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      toast('रचना सफलतापूर्वक भेज दी गई!');
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
    myArticles.innerHTML = '<div class="loading">लोड हो रहा है…</div>';
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
    else if (!arts.data.length) myArticles.innerHTML = '<div class="empty">अभी तक आपने कोई रचना नहीं भेजी है। <a href="#submit" data-close>अपनी पहली रचना भेजें →</a></div>';
    else {
      myArticles.innerHTML = arts.data.map((a) => `
        <div class="sub-item">
          <div class="top">
            <div><b>${esc(a.title)}</b>
              <div class="meta">${esc(CATEGORY_LABEL[a.category] || a.category)} · ${esc(LANGUAGE_LABEL[a.language] || a.language)} · भेजी गई: ${esc(fmtDate(a.created_at))}</div></div>
            <span class="status ${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
          </div>
          ${a.editor_note ? `<div class="note"><b>संपादक मंडल की टिप्पणी:</b> ${esc(a.editor_note)}</div>` : ''}
        </div>`).join('');
    }

    if (quiz.error) myQuiz.innerHTML = `<div class="alert alert-error">${esc(friendly(quiz.error))}</div>`;
    else if (!quiz.data.length) myQuiz.innerHTML = '<div class="empty">आपने अभी तक किसी प्रश्नोत्तरी में भाग नहीं लिया है। <a href="#quiz" data-close>इस माह की प्रश्नोत्तरी में भाग लें →</a></div>';
    else {
      myQuiz.innerHTML = quiz.data.map((q) => `
        <div class="sub-item">
          <div class="top">
            <div><b>प्रश्नोत्तरी — ${esc(q.edition)}</b><div class="meta">जमा: ${esc(fmtDate(q.submitted_at))}</div></div>
            <span class="status shortlisted">प्राप्त</span>
          </div>
          <details><summary>मेरे उत्तर देखें</summary>
            <ol>${q.answers.map((ans) => `<li>${esc(ans) || '<span class="muted">— खाली छोड़ा —</span>'}</li>`).join('')}</ol>
          </details>
        </div>`).join('');
    }
  }

  window.openAccount = function () {
    if (!Auth.user) { window.openAuth('login', 'अपनी प्रोफ़ाइल और प्रविष्टियाँ देखने के लिए लॉग इन करें।'); return; }
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
      return setAlert(acctAlert, 'error', 'नाम, पदनाम, विभाग और तैनाती स्थल भरना अनिवार्य है।');
    }
    v.employee_no = v.employee_no || null;
    withBusy(profileForm, async () => {
      const { error } = await sb.from('profiles').update(v).eq('id', Auth.user.id);
      if (error) return setAlert(acctAlert, 'error', friendly(error));
      await Auth.reloadProfile();
      setAlert(acctAlert, 'success', 'आपकी प्रोफ़ाइल अपडेट हो गई है।');
    });
  });

  // =====================================================================
  // WIRING
  // =====================================================================
  if (Auth.unavailable) {
    const msg = 'ऑनलाइन प्रविष्टि की सुविधा अस्थायी रूप से उपलब्ध नहीं है। कृपया अपनी प्रविष्टि dvchrnewsletter@gmail.com पर ईमेल करें।';
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
