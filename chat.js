/*
 * Ask the Archive — the chat widget, on every page.
 *
 * Loaded as a CLASSIC script like everything else here, and it builds all of
 * its own markup, so it needs no inline onclick= handlers and puts nothing in
 * global scope beyond mountChat(). Everything else lives inside the IIFE, which
 * matters because this file loads alongside archive.html, document.html and
 * posts.js, each of which declares its own top-level `esc`.
 *
 * It is deliberately self-mounting: "available at all times" means seven pages,
 * and a widget that each page has to remember to call is a widget that will be
 * missing from the eighth.
 *
 * While CHAT_MOCK is true the answers come from a canned script instead of the
 * network. That is not a stub to be embarrassed about — it is what lets the
 * interface be judged now and wired later, and the swap is one flag.
 */
(function () {
  'use strict';

  var STORE_KEY = 'irp-chat-thread';
  var HINT_KEY = 'irp-chat-hint-seen';
  var MAX_KEY = 'irp-chat-maximised';

  var state = {
    open: false,
    max: false,
    busy: false,
    sessionId: null,
    messages: []        // { role: 'user' | 'bot', text, sources? }
  };

  var el = {};          // mounted nodes

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Browser storage throws in private windows and comes back empty with site
  // data cleared, so every read and write is guarded and the widget renders
  // correctly without it. The transcript is a convenience, not state of record.
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && Array.isArray(saved.messages)) {
        state.messages = saved.messages;
        state.sessionId = saved.sessionId || null;
      }
    } catch (e) { /* no storage; start fresh */ }
  }

  function save() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        messages: state.messages.slice(-40),   // a long thread is not worth unbounded storage
        sessionId: state.sessionId
      }));
    } catch (e) { /* ignore */ }
  }

  function hintSeen() {
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return true; }
  }

  function markHintSeen() {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ }
  }

  // Whether the panel was last left maximised. Remembered across pages and
  // visits, because someone who wants the big reading surface wants it on the
  // next page too, and re-expanding it on every navigation would be tedious.
  function loadMax() {
    try { return localStorage.getItem(MAX_KEY) === '1'; } catch (e) { return false; }
  }

  function saveMax() {
    try { localStorage.setItem(MAX_KEY, state.max ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // ── icons ───────────────────────────────────────────────────────────────
  // Inline SVG rather than an icon font: Material Icons is only loaded on
  // document.html, and adding a blocking font request to six more pages to draw
  // three glyphs is a poor trade.
  var ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v6h6"/><path d="M3.5 13a9 9 0 1 0 2.6-7.4L3 8"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
    // Arrows out / arrows in, the conventional pair for expand and restore.
    max: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    min: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>'
  };

  // ── mount ───────────────────────────────────────────────────────────────

  function mountChat() {
    if (el.fab) return;

    var fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Ask the Archive');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = ICON.chat;

    var hint = document.createElement('div');
    hint.className = 'chat-hint';
    hint.textContent = 'Ask the archive a question';
    hint.hidden = hintSeen();

    var panel = document.createElement('section');
    panel.className = 'chat-panel';
    panel.hidden = true;
    // Not aria-modal: the page stays usable behind it, which is the point of a
    // reference tool that sits beside what you are reading.
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ask the Archive');
    panel.innerHTML =
      '<header class="chat-head">' +
        '<div><h2>Ask the Archive</h2><p>Bastrop County collection</p></div>' +
        '<div class="chat-head__btns">' +
          '<button type="button" class="chat-icon-btn" data-chat="max" ' +
            'aria-pressed="false" aria-label="Expand the conversation" ' +
            'title="Expand">' + ICON.max + '</button>' +
          '<button type="button" class="chat-icon-btn" data-chat="reset" ' +
            'aria-label="Start a new conversation" title="New conversation">' + ICON.reset + '</button>' +
          '<button type="button" class="chat-icon-btn" data-chat="close" ' +
            'aria-label="Close" title="Close">' + ICON.close + '</button>' +
        '</div>' +
      '</header>' +
      // aria-live so a screen reader hears an answer arrive without the focus
      // being yanked out of the textarea mid-sentence.
      '<div class="chat-log" id="chatLog" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<form class="chat-form" data-chat="form">' +
        '<textarea rows="1" placeholder="Ask about the collection…" ' +
          'aria-label="Your question" data-chat="input"></textarea>' +
        '<button type="submit" aria-label="Send" data-chat="send">' + ICON.send + '</button>' +
      '</form>' +
      '<p class="chat-foot">Answers are generated from the archive and can be wrong. ' +
        'Check the cited records before relying on them.</p>';

    document.body.appendChild(hint);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    el = {
      fab: fab, hint: hint, panel: panel,
      log: panel.querySelector('#chatLog'),
      max: panel.querySelector('[data-chat="max"]'),
      form: panel.querySelector('[data-chat="form"]'),
      input: panel.querySelector('[data-chat="input"]'),
      send: panel.querySelector('[data-chat="send"]')
    };

    fab.addEventListener('click', toggle);
    panel.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-chat="close"]')) toggle(false);
      if (ev.target.closest('[data-chat="max"]')) toggleMax();
      if (ev.target.closest('[data-chat="reset"]')) reset();
      var s = ev.target.closest('[data-chat-suggest]');
      if (s) ask(s.getAttribute('data-chat-suggest'));
    });
    el.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ask(el.input.value);
    });
    // Enter sends, Shift+Enter makes a newline — the convention everywhere else.
    el.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ask(el.input.value); }
    });
    el.input.addEventListener('input', grow);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !state.open) return;
      // One step at a time: a maximised panel covers most of the page, so the
      // first Escape gives the page back and the second closes the chat. Losing
      // a transcript to a stray keypress is the worse outcome.
      if (state.max) toggleMax(); else toggle(false);
    });

    load();
    state.max = loadMax();
    applyMax();
    render();
  }

  /** Switch between the corner panel and the near-fullscreen reading surface. */
  function toggleMax() {
    state.max = !state.max;
    saveMax();
    applyMax();
    // The button the pointer is still over changes meaning, so the label has to
    // change with it; focus stays put so a keyboard user is not thrown out.
    el.input.focus();
  }

  function applyMax() {
    el.panel.classList.toggle('chat-panel--max', state.max);
    el.max.innerHTML = state.max ? ICON.min : ICON.max;
    el.max.setAttribute('aria-pressed', String(state.max));
    var label = state.max ? 'Shrink the conversation' : 'Expand the conversation';
    el.max.setAttribute('aria-label', label);
    el.max.setAttribute('title', state.max ? 'Shrink' : 'Expand');
    // Growing the panel moves the transcript; keep the newest message in view.
    if (el.log) el.log.scrollTop = el.log.scrollHeight;
  }

  function grow() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(el.input.scrollHeight, 110) + 'px';
  }

  function toggle(force) {
    state.open = typeof force === 'boolean' ? force : !state.open;
    el.panel.hidden = !state.open;
    el.fab.hidden = state.open;          // the panel's own close button replaces it
    el.fab.setAttribute('aria-expanded', String(state.open));
    if (state.open) {
      el.hint.hidden = true;
      markHintSeen();
      render();
      el.input.focus();
    } else {
      // Focus goes back to the trigger, or it lands at the top of the document
      // and a keyboard user has to tab through the whole page again.
      el.fab.focus();
    }
  }

  function reset() {
    state.messages = [];
    state.sessionId = null;
    save();
    render();
    el.input.focus();
  }

  // ── rendering ───────────────────────────────────────────────────────────

  function render() {
    if (!el.log) return;
    var html = '';

    if (!state.messages.length) {
      html += '<div class="chat-msg chat-msg--bot">' +
        '<p>I can answer questions about the Bastrop County Archive — the ' +
        'digitised texts and the cleaned census datasets. Every answer cites the ' +
        'records it came from.</p></div>';
      var picks = (typeof CHAT_SUGGESTIONS !== 'undefined' ? CHAT_SUGGESTIONS : []);
      if (picks.length) {
        html += '<div class="chat-suggest">' + picks.map(function (q) {
          return '<button type="button" data-chat-suggest="' + esc(q) + '">' + esc(q) + '</button>';
        }).join('') + '</div>';
      }
    }

    state.messages.forEach(function (m) {
      if (m.role === 'user') {
        html += '<div class="chat-msg chat-msg--user">' + paragraphs(m.text) + '</div>';
        return;
      }
      html += '<div class="chat-msg chat-msg--bot">' + paragraphs(m.text) + sourcesHtml(m.sources) + '</div>';
    });

    if (state.busy) {
      html += '<div class="chat-msg chat-msg--bot"><div class="chat-typing">' +
        '<span></span><span></span><span></span></div></div>';
    }

    el.log.innerHTML = html;
    el.log.scrollTop = el.log.scrollHeight;
    el.send.disabled = state.busy;
  }

  function paragraphs(text) {
    return String(text).split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /** Source chips linking to the record, which is the whole value of this over
   *  a general chatbot: an answer you can follow back to a document. */
  function sourcesHtml(sources) {
    if (!sources || !sources.length) return '';
    var items = sources.map(function (s) {
      var label = s.title || s.documentId || 'record';
      if (s.page) label += ', p. ' + s.page;
      var href = s.documentId
        ? 'document.html?id=' + encodeURIComponent(s.documentId)
        : null;
      return href
        ? '<li><a class="chat-source" href="' + esc(href) + '">' + esc(label) + '</a></li>'
        : '<li><span class="chat-source">' + esc(label) + '</span></li>';
    }).join('');
    return '<div class="chat-sources">' +
      '<span class="chat-sources__label">Sources</span><ul>' + items + '</ul></div>';
  }

  // ── asking ──────────────────────────────────────────────────────────────

  function ask(raw) {
    var question = String(raw || '').trim();
    if (!question || state.busy) return;

    state.messages.push({ role: 'user', text: question });
    state.busy = true;
    el.input.value = '';
    grow();
    render();

    answer(question).then(function (res) {
      state.sessionId = res.sessionId || state.sessionId;
      state.messages.push({ role: 'bot', text: res.answer, sources: res.sources || [] });
    }).catch(function (err) {
      state.messages.push({
        role: 'bot',
        text: err && err.friendly
          ? err.friendly
          : 'Something went wrong reaching the archive. Please try again in a moment.'
      });
    }).then(function () {
      state.busy = false;
      save();
      render();
    });
  }

  function answer(question) {
    if (typeof CHAT_MOCK !== 'undefined' && CHAT_MOCK) return mockAnswer(question);

    return fetch(CHAT_API_URL, {
      method: 'POST',
      // A JSON content type triggers a CORS preflight. Every other fetch on the
      // site avoids custom headers to stay a "simple request", but a POST body
      // cannot, so /chat must answer OPTIONS as well as POST.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, sessionId: state.sessionId })
    }).then(function (res) {
      if (res.status === 429) {
        var busy = new Error('rate limited');
        busy.friendly = 'The archive is handling a lot of questions right now. Try again shortly.';
        throw busy;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      return {
        answer: data.answer || data.output || '(no answer returned)',
        sessionId: data.sessionId,
        sources: data.sources || []
      };
    });
  }

  // ── mock ────────────────────────────────────────────────────────────────
  //
  // Canned replies keyed loosely on what is actually in the collection, so the
  // layout is exercised with realistic lengths and real documentIds: a chip has
  // to link somewhere, and a one-line fake answer hides every wrapping problem.

  var MOCK = [
    { on: ['pease', 'porridge', 'recipe', 'remedy'],
      text: 'The archive holds "Pease Porridge Hot: Recipes, Household Hints & Home ' +
            'Remedies of the Pease Family" (1967), annotated by Katherine Hart and ' +
            'published by The Encino Press for the Friends of the Austin Public Library.\n\n' +
            'It draws on the Pease Family Papers and collects household recipes and ' +
            'remedies alongside family correspondence. The letters are valuable as ' +
            'social documents of nineteenth-century Texas, quite apart from Governor ' +
            'Elisha Marshall Pease’s public career.',
      sources: [{ documentId: 'irp-books-000001', title: 'Pease Porridge Hot', page: 12 }] },

    { on: ['census', 'year', 'population', 'how many'],
      text: 'Cleaned census datasets are available for ten years: 1850, 1860, 1870, ' +
            '1880, 1900, 1910, 1920, 1930, 1940 and 1950.\n\n' +
            'There is no 1890 data, and there cannot be — the 1890 federal schedules ' +
            'were destroyed by fire in 1921. Together the workbooks hold about 75,500 ' +
            'distinct rows, organised by enumeration district and precinct.',
      sources: [
        { documentId: 'irp-cens-000001', title: '1850 census', page: null },
        { documentId: 'irp-cens-000010', title: '1950 census', page: null }
      ] },

    { on: ['slave', 'slavery', 'enslaved', 'freedmen'],
      text: 'Two census datasets include slave schedules, which enumerate enslaved ' +
            'people by owner rather than by household: 1850 and 1860. The 1860 ' +
            'workbook carries three such sheets covering Bastrop and precincts 1 to 13.\n\n' +
            'For narrative context the archive also holds "And Grace Will Lead Me ' +
            'Home: African American Freedmen Communities of Austin, Texas, 1865–1928".',
      sources: [
        { documentId: 'irp-cens-000002', title: '1860 census', page: null },
        { documentId: 'irp-books-000003', title: 'And Grace Will Lead Me Home', page: null }
      ] },

    { on: ['austin originals', 'colorful', 'interview'],
      text: '"Austin Originals: Chats with Colorful Characters" (1982) collects ' +
            'interviews and photographic portraits of longtime Austin residents, ' +
            'published by Paramount Publishing and held by the Austin History Center.',
      sources: [{ documentId: 'irp-books-000002', title: 'Austin Originals', page: 3 }] }
  ];

  function mockAnswer(question) {
    var q = question.toLowerCase();
    var hit = null;
    for (var i = 0; i < MOCK.length && !hit; i++) {
      for (var j = 0; j < MOCK[i].on.length; j++) {
        if (q.indexOf(MOCK[i].on[j]) !== -1) { hit = MOCK[i]; break; }
      }
    }
    var reply = hit || {
      text: 'I could not find anything in the archive about that. The collection ' +
            'covers Bastrop County and central Texas — digitised books and ' +
            'cleaned federal census data from 1850 to 1950 — so a question about ' +
            'those will fare better.',
      sources: []
    };
    // A deliberate delay: an answer that appears instantly never shows the
    // typing state, and the typing state is most of what makes waiting bearable.
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ answer: reply.text, sources: reply.sources, sessionId: 'mock-session' });
      }, 700 + Math.random() * 500);
    });
  }

  // Exposed so a page could mount it explicitly; otherwise it self-mounts.
  window.mountChat = mountChat;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountChat);
  } else {
    mountChat();
  }
})();
