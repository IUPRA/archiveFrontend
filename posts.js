// Shared blog-post data layer — GET /blog-posts
//
// Used by blog.html (the full list) and index.html (the newest three). Posts
// are authored in AWS; no credentials belong in the browser.
//
// Loaded as a CLASSIC script, after config.js, so API_BASE_URL and these
// functions are plain globals the pages' inline scripts can see.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
));

/** Tags arrive either as an array or as a comma-separated string. */
const asTags = (v) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map(t => String(t).trim())
  .filter(Boolean);

/** "2026-04-12T00:00:00Z" → "4/12/26"; anything unparseable passes through. */
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  // Read in UTC: a date-only value arrives as UTC midnight, which would
  // otherwise render as the previous day for anyone west of Greenwich.
  return isNaN(d) ? String(value) : d.toLocaleDateString('en-US',
    { year: '2-digit', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Normalise one API record into the shape the card renderer uses.
 *
 * Several key spellings are accepted per field because the deployed record
 * shape is not settled yet. This is the one place to adjust once it is.
 */
function normalizeBlogPost(it) {
  const body = (it.body ?? it.content ?? it.information ?? '').trim();
  return {
    postId: it.postId ?? it.blogPostId ?? it.slug ?? '',
    title:  it.title ?? '(untitled)',
    // `summary` is the short blurb when an author writes one; fall back to the
    // opening of the body so a card is never left without an excerpt.
    excerpt: (it.summary || it.excerpt || '').trim()
             || (body.length > 180 ? body.slice(0, 180).trimEnd() + '…' : body),
    author:  it.author ?? it.name ?? '',
    date:    it.publishedAt ?? it.date ?? '',
    tags:    asTags(it.tags),
    // s3Key is a bucket key; mediaUrl() (config.js) resolves it against
    // MEDIA_BASE_URL, and returns null while that is unset.
    imageUrl: mediaUrl(it.imageUrl ?? it.heroUrl ?? it.s3Key),
    status: it.status ?? 'PUBLISHED',
  };
}

/**
 * Render one normalised post as a .blog-card article.
 *
 * heading:  'h2' on the blog page, 'h3' on the home page, where the section
 *           already owns the h2.
 * showTags: the home page's compact cards leave the tag row off.
 */
function renderPost(p, { heading = 'h2', showTags = true } = {}) {
  // No post detail page exists yet; point the links here once there is one.
  const href = '#';

  // A post with no cover image shows no image band at all. The old dashed
  // "post_image" placeholder announced the absence; the --text variant instead
  // carries a thin rule where the image would have begun, so a text-only post
  // and an illustrated one read as the same kind of object in the grid.
  //
  // An image that fails to load falls back to the same treatment rather than
  // leaving a blank band.
  const img = p.imageUrl
    ? `<img class="blog-card__img" src="${esc(p.imageUrl)}" alt="${esc(p.title)}"
           loading="lazy" decoding="async" referrerpolicy="no-referrer"
           onerror="this.closest('.blog-card').classList.add('blog-card--text'); this.remove();">`
    : '';

  const meta = [formatDate(p.date), p.author].filter(Boolean).join(' · ');
  const tags = showTags
    ? `<div class="tag-list" style="margin-top:0">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>`
    : '<span></span>';

  return `
    <article class="blog-card${p.imageUrl ? '' : ' blog-card--text'}">
      ${img}
      <div class="blog-card__body">
        <p class="blog-card__meta">${esc(meta)}</p>
        <${heading} class="blog-card__title"><a href="${esc(href)}">${esc(p.title)}</a></${heading}>
        <p class="blog-card__excerpt">${esc(p.excerpt)}</p>
        <div class="blog-card__footer">
          ${tags}
          <a href="${esc(href)}" class="btn btn--ghost btn--sm">Read more →</a>
        </div>
      </div>
    </article>`;
}

/**
 * Fetch every post, normalised and sorted newest first by publishedAt.
 * Undated posts sort to the end. Throws on transport or shape errors; each
 * caller decides how to show the failure.
 */
async function fetchPosts() {
  // No custom headers: this stays a CORS "simple request", so the browser
  // never needs to send an OPTIONS preflight.
  const res = await fetch(`${API_BASE_URL}/blog-posts`);
  if (!res.ok) throw new Error(`The blog API returned HTTP ${res.status} ${res.statusText}.`);
  const body = await res.json();
  // Bare array or { items: [...] }.
  const raw = Array.isArray(body) ? body : (body.items ?? []);
  if (!Array.isArray(raw)) throw new Error('The blog API returned an unexpected response shape.');

  return raw
    .map(normalizeBlogPost)
    // Posts may still be authored as DRAFT, so drafts are shown for now.
    // Uncomment once the workflow publishes them:
    // .filter(p => p.status === 'PUBLISHED')
    .sort((a, b) => {
      // Missing dates go last rather than sorting as the empty string.
      if (!a.date !== !b.date) return a.date ? -1 : 1;
      return String(b.date).localeCompare(String(a.date));
    });
}

/** Message for a failed fetch — a dead API reads differently from a bad one. */
function postErrorMessage(err) {
  return err instanceof TypeError
    ? 'Could not reach the blog API. Check your connection and that the API allows this origin.'
    : err.message;
}
