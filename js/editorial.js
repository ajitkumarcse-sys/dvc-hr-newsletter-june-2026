/* MY DVC – MY VOICE · js/editorial.js
   Progressive enhancement for "The Valley Folio". Loaded last, with defer, on index.html,
   dashboard.html, accessibility.html and privacy.html. It never replaces existing behaviour:
   each feature looks for its own markup, does nothing when that markup is absent, and runs
   in isolation, so one failure cannot stop the others. No libraries, no globals.

   1 Reading settings (text size · theme · motion)   7 Lightbox (alt, gallery, keys, swipe)
   2 Live reduced-motion state                       8 Before/after compare
   3 Scroll reveals                                  9 Quiz tally
   4 Scroll-spy                                     10 Share a section · copy text
   5 Contents drawer (Escape, focus, scroll lock)   11 Deadline countdown
   6 Reading-progress fallback                      12 Reading times                          */
(function () {
  'use strict';

  var d = document, w = window, root = d.documentElement;
  var hasIO = 'IntersectionObserver' in w;
  var hasMO = 'MutationObserver' in w;

  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var own = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var closest = function (e, sel) {
    var t = e.target;
    if (t && t.nodeType !== 1) t = t.parentNode;
    return t && t.closest ? t.closest(sel) : null;
  };
  var run = function (name, fn) {
    try { fn(); } catch (err) { if (w.console && console.error) console.error('[editorial] ' + name, err); }
  };
  var media = function (q) {
    try { return w.matchMedia ? w.matchMedia(q) : null; } catch (e) { return null; }
  };
  var onMedia = function (m, fn) {
    if (!m) return;
    if (m.addEventListener) m.addEventListener('change', fn);
    else if (m.addListener) m.addListener(fn);
  };
  var focusQuiet = function (el) {
    if (!el || !el.focus) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  };

  /* Storage: our own wrapper (window.UI.store may not exist on every page).
     Values are JSON, matching the inline <head> script that applies them before first paint. */
  var store = {
    get: function (k) { try { return JSON.parse(w.localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { w.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };

  /* Toast: auth.js's UI.toast when present, otherwise drive #toast directly. */
  var toastTimer;
  var toast = function (msg, type) {
    if (w.UI && typeof w.UI.toast === 'function') { w.UI.toast(msg, type); return; }
    var t = d.getElementById('toast');
    if (!t) {
      t = d.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      d.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('error', type === 'error');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4000);
  };

  /* 2 · Reduced motion = the OS setting OR the site switch (html[data-motion="reduce"]).
     Re-evaluated live; features subscribe through motionWatchers. */
  var rmQuery = media('(prefers-reduced-motion: reduce)');
  var reduced = function () {
    return root.getAttribute('data-motion') === 'reduce' || !!(rmQuery && rmQuery.matches);
  };
  var motionWatchers = [];
  var wasReduced = null;
  var motionCheck = function () {
    var now = reduced();
    if (now === wasReduced) return;
    wasReduced = now;
    motionWatchers.forEach(function (fn) { run('motion watcher', function () { fn(now); }); });
  };

  /* 1 · Reading settings. Every copy of each control (hero strip, Contents drawer, footer)
     is wired by one delegated listener and kept in sync through aria-pressed. */
  function readingSettings() {
    var SIZES = { md: '', lg: '112.5%', xl: '125%' };
    var THEMES = { light: '#FFFFFF', dark: '#111923', auto: '' };   /* value = theme-color when forced */
    var MOTIONS = { full: 1, reduce: 1 };

    var press = function (attr, value) {
      $$('[' + attr + ']').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute(attr) === value ? 'true' : 'false');
      });
    };

    /* Theme switches swap every colour at once; suspend transitions for that one frame
       so the page changes cleanly instead of fading piecemeal. */
    var instant = function (change) {
      var s = d.createElement('style');
      s.textContent = '*,*::before,*::after{transition:none !important}';
      (d.head || root).appendChild(s);
      change();
      void w.getComputedStyle(d.body || root).backgroundColor;      /* flush styles while frozen */
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 0);
    };

    var metas = $$('meta[name="theme-color"]');
    var metaAuto = metas.map(function (m) { return m.getAttribute('content'); });

    var setSize = function (k) {
      if (!own(SIZES, k)) k = 'md';
      root.style.fontSize = SIZES[k];
      press('data-ts', k);
      return k;
    };
    var setTheme = function (k) {
      if (!own(THEMES, k)) k = 'auto';
      if ((root.getAttribute('data-theme') || 'auto') !== k) {
        instant(function () {
          if (k === 'auto') root.removeAttribute('data-theme');
          else root.setAttribute('data-theme', k);
        });
      }
      metas.forEach(function (m, i) {
        var c = THEMES[k] || metaAuto[i];
        if (c) m.setAttribute('content', c);
      });
      press('data-theme-set', k);
      return k;
    };
    var setMotion = function (k) {
      if (!own(MOTIONS, k)) k = 'full';
      if (k === 'reduce') root.setAttribute('data-motion', 'reduce');
      else root.removeAttribute('data-motion');
      press('data-motion-set', k);
      return k;
    };

    /* Initial state: the stored choice, else whatever the <head> script already applied. */
    var fs = root.style.fontSize;
    var size = store.get('ui:textSize');
    if (!own(SIZES, size)) size = fs === '125%' ? 'xl' : fs === '112.5%' ? 'lg' : 'md';
    var theme = store.get('ui:theme');
    if (!own(THEMES, theme)) theme = root.getAttribute('data-theme') === 'dark' ? 'dark'
      : root.getAttribute('data-theme') === 'light' ? 'light' : 'auto';
    var motion = store.get('ui:motion');
    if (!own(MOTIONS, motion)) motion = root.getAttribute('data-motion') === 'reduce' ? 'reduce' : 'full';
    setSize(size);
    setTheme(theme);
    setMotion(motion);

    d.addEventListener('click', function (e) {
      var b = closest(e, '[data-ts],[data-theme-set],[data-motion-set]');
      if (!b) return;
      if (b.hasAttribute('data-ts')) {
        /* Keep the pressed control under the reader's finger while the page reflows. */
        var before = b.getBoundingClientRect().top;
        store.set('ui:textSize', setSize(b.getAttribute('data-ts')));
        var shift = b.getBoundingClientRect().top - before;
        if (Math.abs(shift) > 1) {
          var sb = root.style.scrollBehavior;
          root.style.scrollBehavior = 'auto';
          w.scrollBy(0, shift);
          root.style.scrollBehavior = sb;
        }
      } else if (b.hasAttribute('data-theme-set')) {
        store.set('ui:theme', setTheme(b.getAttribute('data-theme-set')));
      } else {
        store.set('ui:motion', setMotion(b.getAttribute('data-motion-set')));
      }
    });

    /* Another tab changed a setting: follow it. */
    w.addEventListener('storage', function (e) {
      if (e.key === 'ui:textSize') setSize(store.get('ui:textSize'));
      else if (e.key === 'ui:theme') setTheme(store.get('ui:theme'));
      else if (e.key === 'ui:motion') setMotion(store.get('ui:motion'));
    });
  }

  /* 3 · Scroll reveals: section openers, river lines, pull quotes, the confluence,
     the lifecycle and .reveal blocks. Hidden states exist only under html.reveal-on,
     which is added after the observer is attached and only when motion is allowed. */
  function reveals() {
    var targets = $$('.reveal, .section-head, .river:not(.river--load), .pullquote, .confluence, .lifecycle');
    if (!targets.length) return;
    var io = null;
    var showAll = function () {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      if (io) { io.disconnect(); io = null; }
      root.classList.remove('reveal-on');
    };
    w.addEventListener('beforeprint', function () { targets.forEach(function (el) { el.classList.add('is-in'); }); });
    if (!hasIO || reduced()) { showAll(); return; }

    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        if (io) io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

    /* Anything already on screen stays visible: it is never hidden, so it never flashes. */
    var vh = w.innerHeight || root.clientHeight;
    targets.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh && (r.width || r.height)) el.classList.add('is-in');
      else io.observe(el);
    });
    root.classList.add('reveal-on');

    /* Motion turned off after load: finish every pending reveal at once. */
    motionWatchers.push(function (isReduced) { if (isReduced) showAll(); });

    /* Safety net for intersections missed during fast jumps. */
    w.addEventListener('load', function () {
      setTimeout(function () {
        if (!io) return;
        var h = w.innerHeight;
        targets.forEach(function (el) {
          if (el.classList.contains('is-in')) return;
          var r = el.getBoundingClientRect();
          if (r.top < h && (r.width || r.height)) { el.classList.add('is-in'); io.unobserve(el); }
        });
      }, 3000);
    });
  }

  /* 4 · Scroll-spy for the Contents links. */
  function scrollSpy() {
    if (!hasIO) return;
    var links = {}, ids = [];
    $$('#navLinks a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      if (id && !own(links, id) && d.getElementById(id)) { links[id] = a; ids.push(id); }
    });
    if (!ids.length) return;
    var current = null;
    var setActive = function (id) {
      if (id === current) return;
      if (current && links[current]) {
        links[current].classList.remove('is-active');
        links[current].removeAttribute('aria-current');
      }
      current = id;
      if (links[id]) {
        links[id].classList.add('is-active');
        links[id].setAttribute('aria-current', 'true');
      }
    };
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    var cover = d.getElementById('top');
    if (cover) spy.observe(cover);                  /* the cover clears the highlight */
    ids.forEach(function (id) { spy.observe(d.getElementById(id)); });
  }

  /* 5 · Contents drawer. The inline script toggles .nav.open; this adds the scroll lock
     (html.toc-open), moves focus in, makes the page behind inert, closes on Escape and
     when the viewport grows into the inline-nav layout. */
  function contentsDrawer() {
    var nav = $('.nav'), toggle = d.getElementById('navToggle'), panel = d.getElementById('navLinks');
    if (!nav || !toggle || !panel) return;
    var drawerMQ = media('(max-width: 1279px)');
    var isDrawer = function () { return !drawerMQ || drawerMQ.matches; };
    var inerted = [];
    var setInert = function (on) {
      inerted.forEach(function (el) { el.removeAttribute('inert'); });
      inerted = [];
      if (!on) return;
      Array.prototype.forEach.call(d.body.children, function (el) {
        if (el === nav || el.contains(nav) || el.id === 'toast' || el.getAttribute('aria-hidden') === 'true'
            || /^(DIALOG|SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return;
        el.setAttribute('inert', '');
        inerted.push(el);
      });
    };
    var close = function () {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    /* Focus the first entry; if the panel is still hidden mid-transition, try again after it. */
    var focusFirst = function () {
      if (!nav.classList.contains('open')) return true;
      var first = $('.toc-list a', panel) || $('a[href], button', panel);
      if (!first) return true;
      focusQuiet(first);
      return d.activeElement === first;
    };
    var wasOpen = false;
    var sync = function () {
      var open = nav.classList.contains('open') && isDrawer();
      if (open === wasOpen) return;
      wasOpen = open;
      root.classList.toggle('toc-open', open);
      setInert(open);
      if (open && !focusFirst()) setTimeout(focusFirst, 300);
    };
    if (hasMO) new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['class'] });
    /* Capture phase: runs before auth.js closes the user menu, so one Escape closes one layer. */
    d.addEventListener('keydown', function (e) {
      if ((e.key !== 'Escape' && e.key !== 'Esc') || !nav.classList.contains('open')) return;
      if ($('dialog[open]') || $('#userMenu.open')) return;
      close();
      toggle.focus();
    }, true);
    onMedia(drawerMQ, function () { if (!isDrawer()) close(); sync(); });
    sync();
  }

  /* 6 · Reading progress: CSS scroll-timeline where supported, otherwise --p on .nav. */
  function readingProgress() {
    var nav = $('.nav');
    if (!nav || !d.body.classList.contains('page-issue')) return;
    if (w.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')) return;
    var raf = w.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    var ticking = false;
    var paint = function () {
      ticking = false;
      var max = root.scrollHeight - w.innerHeight;
      var y = w.pageYOffset || root.scrollTop || 0;
      nav.style.setProperty('--p', max > 0 ? Math.min(1, Math.max(0, y / max)).toFixed(4) : '0');
    };
    var request = function () { if (!ticking) { ticking = true; raf(paint); } };
    w.addEventListener('scroll', request, { passive: true });
    w.addEventListener('resize', request, { passive: true });
    w.addEventListener('load', request);
    paint();
  }

  /* 7 · Lightbox. The inline script opens the dialog on a.zoom click; this delegated
     listener runs after it (bubble phase) and adds alt text, a caption, gallery stepping
     within [data-gallery] (duplicate hrefs collapse to one), arrow keys, swipe, a counter,
     next-image preload and focus return. It also opens links added after the inline script. */
  function lightbox() {
    var lb = d.getElementById('lightbox'), lbImg = d.getElementById('lightbox-img'), lbCap = d.getElementById('lightbox-cap');
    if (!lb || !lbImg) return;
    var prev = $('.lb-prev', lb), next = $('.lb-next', lb), counter = $('.lb-count', lb);
    var group = [], idx = 0, dir = 1, opener = null;
    if (!lb.hasAttribute('aria-label') && !lb.hasAttribute('aria-labelledby')) lb.setAttribute('aria-label', 'चित्र दर्शक');
    lbImg.draggable = false;

    var describe = function (a) {
      var img = $('img', a);
      var named = (img && img.getAttribute('alt')) || a.getAttribute('data-caption') || a.getAttribute('aria-label') || a.getAttribute('title');
      var langEl = (img || a).closest('[lang]');
      var it = { href: a.getAttribute('href'), text: named || (a.textContent || '').replace(/\s+/g, ' ').trim(),
        lang: langEl ? langEl.getAttribute('lang') : '', rich: null };
      if (!named && !img) {
        /* A text link (e.g. "View the original page"): mirror its markup so inner lang="hi" spans survive. */
        it.rich = Array.prototype.filter.call(a.childNodes, function (n) {
          return !(n.nodeType === 1 && /^svg$/i.test(n.nodeName));
        }).map(function (n) {
          var c = n.cloneNode(true);
          if (c.nodeType === 1) {
            c.removeAttribute('id');
            $$('[id]', c).forEach(function (x) { x.removeAttribute('id'); });
          }
          return c;
        });
      }
      return it;
    };
    var setLang = function (el, lang) { if (lang) el.setAttribute('lang', lang); else el.removeAttribute('lang'); };
    var preload = function (i) {
      if (group.length < 2) return;
      var h = group[(i + group.length) % group.length].getAttribute('href');
      if (h) { var im = new Image(); im.src = h; }
    };
    var show = function (i) {
      if (!group.length) return;
      idx = (i + group.length) % group.length;
      var it = describe(group[idx]);
      if (lbImg.getAttribute('src') !== it.href) lbImg.src = it.href;
      lbImg.alt = it.text;
      setLang(lbImg, it.lang);
      if (lbCap) {
        lbCap.textContent = it.rich ? '' : it.text;
        if (it.rich) it.rich.forEach(function (n) { lbCap.appendChild(n); });
        setLang(lbCap, it.lang);
      }
      if (counter) {
        if (group.length > 1) {
          counter.innerHTML = '<span aria-hidden="true">' + (idx + 1) + ' / ' + group.length + '</span>'
            + '<span class="sr-only">फ़ोटो ' + (idx + 1) + ', कुल ' + group.length + ' में से</span>';
        } else {
          counter.textContent = '';
        }
      }
      preload(idx + dir);
    };
    var step = function (by) { dir = by < 0 ? -1 : 1; show(idx + by); };

    d.addEventListener('click', function (e) {
      var a = closest(e, 'a.zoom');
      if (!a || !a.getAttribute('href')) return;
      opener = a;
      var scope = a.closest('[data-gallery]'), seen = {};
      group = (scope ? $$('a.zoom', scope) : [a]).filter(function (z) {
        var h = z.getAttribute('href');
        if (!h || seen[h]) return false;
        seen[h] = true;
        return true;
      });
      var at = 0, href = a.getAttribute('href');
      group.forEach(function (z, i) { if (z.getAttribute('href') === href) at = i; });
      var many = group.length > 1;
      if (prev) prev.hidden = !many;
      if (next) next.hidden = !many;
      dir = 1;
      show(at);
      if (!lb.open) {                                   /* a link the inline script never saw */
        e.preventDefault();
        try { lb.showModal(); } catch (err) { /* not connected or already open */ }
      }
    });

    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
    lb.addEventListener('keydown', function (e) {
      if (group.length < 2) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'Left') { e.preventDefault(); step(-1); }
      else if (k === 'ArrowRight' || k === 'Right') { e.preventDefault(); step(1); }
      else if (k === 'Home') { e.preventDefault(); dir = 1; show(0); }
      else if (k === 'End') { e.preventDefault(); dir = -1; show(group.length - 1); }
    });

    /* Swipe on the photo. Pointer capture keeps a drag that ends over the dark area
       from counting as a click on the dialog (which would close it). */
    var x0 = null, y0 = 0, pid = null;
    lbImg.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; pid = e.pointerId;
      try { lbImg.setPointerCapture(pid); } catch (err) { /* unsupported */ }
    });
    lbImg.addEventListener('pointerup', function (e) {
      if (x0 === null || e.pointerId !== pid) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (group.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) step(dx < 0 ? 1 : -1);
    });
    lbImg.addEventListener('pointercancel', function () { x0 = null; });

    lb.addEventListener('close', function () {
      var o = opener;
      opener = null;
      group = [];
      if (o && d.documentElement.contains(o)) focusQuiet(o);
    });
  }

  /* 8 · Waste-to-Worth compare: drives --split, adds .ba-ready (the no-JS fallback is the
     plain photo) and plays one gentle nudge on first sight unless motion is reduced. */
  function compare() {
    $$('.w2w').forEach(function (fig) {
      var range = $('.ba-range', fig);
      if (!range) return;
      var timers = [], touched = false;
      var set = function (v) {
        v = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
        fig.style.setProperty('--split', v + '%');
        range.setAttribute('aria-valuetext', v + '% पहले, ' + (100 - v) + '% बाद में');
      };
      var stop = function () {
        timers.forEach(clearTimeout);
        timers = [];
        fig.classList.remove('is-nudge');
      };
      var user = function () { touched = true; stop(); };
      range.addEventListener('pointerdown', user);
      range.addEventListener('keydown', user);
      range.addEventListener('input', function () { user(); set(range.value); });
      set(range.value);
      fig.classList.add('ba-ready');

      motionWatchers.push(function (isReduced) {
        if (isReduced && timers.length) { stop(); range.value = 50; set(50); }
      });
      if (!hasIO) return;
      var o = new IntersectionObserver(function (entries) {
        if (!entries[0] || !entries[0].isIntersecting) return;
        o.disconnect();
        if (touched || reduced()) return;
        fig.classList.add('is-nudge');
        [42, 58, 50].forEach(function (v, i) {
          timers.push(setTimeout(function () { range.value = v; set(v); }, 400 * (i + 1)));
        });
        timers.push(setTimeout(function () { timers = []; fig.classList.remove('is-nudge'); }, 1700));
      }, { threshold: 0.6 });
      o.observe($('.ba', fig) || fig);
    });
  }

  /* 9 · Quiz tally and answered state. main.js renders #quizList before this file runs;
     re-renders, restored drafts and the read-only "already submitted" state are caught
     by the observers. */
  function quizTally() {
    var list = d.getElementById('quizList'), tally = $('[data-tally]');
    if (!list || !tally) return;
    var countEl = $('[data-tally-count]', tally), totalEl = $('[data-tally-total]', tally);
    var last = '';
    var sync = function () {
      var inputs = $$('.quiz-input', list), n = 0;
      inputs.forEach(function (inp) {
        var filled = String(inp.value || '').trim() !== '';
        if (filled) n++;
        var li = inp.closest('li');
        if (li) li.classList.toggle('answered', filled);
      });
      var key = n + '/' + inputs.length;
      if (key === last) return;
      last = key;
      if (countEl) countEl.textContent = n;
      if (totalEl && inputs.length) totalEl.textContent = inputs.length;
      tally.style.setProperty('--answered', n);
      tally.style.setProperty('--total', inputs.length || 10);
    };
    list.addEventListener('input', sync);
    if (hasMO) {
      var mo = new MutationObserver(sync);
      mo.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['readonly', 'disabled'] });
      var qAlert = d.getElementById('quizAlert');
      if (qAlert) mo.observe(qAlert, { attributes: true, attributeFilter: ['class'] });
    }
    sync();
  }

  /* 10 · Share a section (native share sheet, else copy the link) and copy text. */
  function shareAndCopy() {
    var copyText = function (text, okMsg) {
      var fallback = function () {
        var active = d.activeElement, ok = false;
        var t = d.createElement('textarea');
        t.value = text;
        t.setAttribute('readonly', '');
        t.style.position = 'fixed';
        t.style.top = '0';
        t.style.opacity = '0';
        d.body.appendChild(t);
        t.select();
        try { t.setSelectionRange(0, text.length); } catch (e) { /* older engines */ }
        try { ok = d.execCommand('copy'); } catch (e) { ok = false; }
        d.body.removeChild(t);
        focusQuiet(active);
        if (ok) toast(okMsg);
        else toast('स्वतः कॉपी नहीं हो सका — ' + text, 'error');
      };
      if (navigator.clipboard && w.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else {
        fallback();
      }
    };

    d.addEventListener('click', function (e) {
      var s = closest(e, '[data-share]');
      if (s) {
        e.preventDefault();
        var id = (s.getAttribute('data-share') || '').replace(/^#/, '');
        var sec = id ? d.getElementById(id) : null, h = sec ? $('h2', sec) : null;
        var url = location.href.split('#')[0] + (id ? '#' + id : '');
        var heading = h ? (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim() : '';
        var title = (heading ? heading + ' · ' : '') + 'MY DVC – MY VOICE, जून 2026';
        var linkMsg = 'लिंक कॉपी हो गया — इसे व्हाट्सऐप या ईमेल में पेस्ट करें।';
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function (err) {
            if (!err || err.name !== 'AbortError') copyText(url, linkMsg);
          });
        } else {
          copyText(url, linkMsg);
        }
        return;
      }
      var c = closest(e, '[data-copy]');
      if (c) {
        e.preventDefault();
        var v = c.getAttribute('data-copy') || '';
        if (v) copyText(v, v.indexOf('@') > 0 ? 'ईमेल पता कॉपी हो गया।' : 'कॉपी हो गया।');
      }
    });
  }

  /* 11 · Deadline countdown: the 22nd of every month (or the day in data-deadline). */
  function deadline() {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    $$('[data-deadline]').forEach(function (el) {
      var day = parseInt(el.getAttribute('data-deadline'), 10);
      if (!(day >= 1 && day <= 28)) day = 22;
      var now = new Date(), y = now.getFullYear(), m = now.getMonth();
      if (now.getDate() > day) { m += 1; if (m > 11) { m = 0; y += 1; } }
      var target = new Date(y, m, day), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var days = Math.round((target - today) / 864e5);
      var when;
      try { when = new Intl.DateTimeFormat('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(target); }
      catch (e) { when = target.toDateString(); }
      var time = d.createElement('time');
      time.setAttribute('datetime', y + '-' + pad(m + 1) + '-' + pad(day));
      time.textContent = when;
      el.textContent = '';
      el.appendChild(d.createTextNode('अगली अंतिम तिथि: '));
      el.appendChild(time);
      el.appendChild(d.createTextNode(' · ' + (days === 0 ? 'आज' : days === 1 ? '1 दिन शेष' : days + ' दिन शेष')));
      el.hidden = false;
    });
  }

  /* 12 · Reading times, recalculated from the live copy each month (200 words a minute). */
  function readingTimes() {
    $$('[data-readtime]').forEach(function (el) {
      var sec = d.getElementById(el.getAttribute('data-readtime'));
      if (!sec) return;
      var words = (sec.textContent || '').trim().split(/\s+/).filter(Boolean).length;
      el.textContent = Math.max(1, Math.round(words / 200)) + ' मिनट में पढ़ें';
    });
  }

  function start() {
    run('reading settings', readingSettings);         /* first: it may set html[data-motion] */
    wasReduced = reduced();
    onMedia(rmQuery, motionCheck);
    if (hasMO) new MutationObserver(motionCheck).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
    run('reveals', reveals);
    run('scroll-spy', scrollSpy);
    run('contents drawer', contentsDrawer);
    run('reading progress', readingProgress);
    run('lightbox', lightbox);
    run('compare', compare);
    run('quiz tally', quizTally);
    run('share and copy', shareAndCopy);
    run('deadline', deadline);
    run('reading times', readingTimes);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})();
