// Shared citation modal — used by archive.html (list cards) and document.html.
//
// Loaded as a CLASSIC script. Everything lives inside an IIFE and only the
// handlers the inline onclick= attributes need are put on window, so this file
// cannot collide with the `esc` each page declares for itself.

(function () {

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));

  /**
   * Creator strings as the record stores them, with any parenthetical role
   * stripped ("Katherine Hart (annotator)" -> "Katherine Hart").
   *
   * They are deliberately not inverted into "Last, First": dcCreator mixes
   * personal and corporate names ("The Pease Family"), and there is no reliable
   * way to tell them apart, so inverting would mangle half of them. Some
   * records already store an inverted form ("Mears, Michelle M."), which is
   * passed through untouched. These are a researcher's starting point, not a
   * finished citation.
   */
  const citeNames = (creators) => (creators || [])
    .map(c => String(c).replace(/\s*\([^)]*\)\s*$/, '').trim())
    .filter(Boolean);

  /** Add a full stop unless the text already ends in one. */
  const dot = (s) => s && !/[.?!]$/.test(s) ? s + '.' : s;

  /**
   * Build the four citation styles for a document.
   *
   * Takes { title, creators, publisher, date }; every part is optional, and a
   * missing one is left out rather than filled with a placeholder. A missing
   * date becomes "n.d.", which is the convention for an undated item.
   */
  function citations(d) {
    const author = citeNames(d.creators).join('; ');
    const year   = String(d.date || '').trim() || 'n.d.';
    const pub    = String(d.publisher || '').trim();
    const title  = String(d.title || '(untitled)').trim();
    const T      = `<em>${esc(title)}</em>.`;
    const A      = author ? esc(dot(author)) : '';
    const P      = pub ? esc(dot(pub)) : '';
    const Y      = esc(dot(year));

    const join = (parts) => parts.filter(Boolean).join(' ');
    return {
      title,
      mla:     join([A, T, P, Y]),
      apa:     join([A, `(${esc(year)}).`, T, P]),
      chicago: join([A, T, P, Y]),
      harvard: join([author ? esc(author) : '', `(${esc(year)})`, T, P]),
    };
  }

  /** Write a document's citations into the modal and open it. */
  function openCiteModal(doc) {
    // Called with no argument from a page that has nothing to cite: show the
    // modal as-is rather than blanking it.
    if (doc) {
      const c = citations(doc);
      const set = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      };
      const titleEl = document.getElementById('citeTitle');
      if (titleEl) titleEl.textContent = c.title;
      set('cite-mla', c.mla);
      set('cite-apa', c.apa);
      set('cite-chicago', c.chicago);
      set('cite-harvard', c.harvard);
    }
    document.getElementById('citeBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCiteModal() {
    document.getElementById('citeBackdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  function closeCiteOnBackdrop(e) {
    if (e.target === document.getElementById('citeBackdrop')) closeCiteModal();
  }

  /** Copy one citation. innerText, not innerHTML, so the <em> does not come along. */
  function copyCite(id, btn) {
    navigator.clipboard.writeText(document.getElementById(id).innerText).then(() => {
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCiteModal(); });

  // The inline onclick= attributes in the markup need these as globals.
  window.citations = citations;
  window.openCiteModal = openCiteModal;
  window.closeCiteModal = closeCiteModal;
  window.closeCiteOnBackdrop = closeCiteOnBackdrop;
  window.copyCite = copyCite;
})();
