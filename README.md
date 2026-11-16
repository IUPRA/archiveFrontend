# Archive Frontend for the TextualDB Project

The public web frontend for the Bastrop County Archive. It is a **static site** —
plain HTML, CSS, and classic (non-module) JavaScript, with no build step, no
bundler, and no npm dependencies. The pages fetch their content at runtime from
an AWS API Gateway endpoint and load images from a CloudFront distribution; both
URLs are public and live in `config.js`.

## Prerequisites

- **git**
- **A local static web server.** Either is fine, and both are almost certainly
  already on your machine:
  - Python 3 (`python3 --version`) — ships with macOS and most Linux distros
  - Node.js (`node --version`) — gives you `npx serve`

You do *not* need to install project dependencies, because there are none.

## Clone

```bash
git clone https://github.com/skramjet/archiveFrontend.git
cd archiveFrontend
```

## Run on localhost

Serve the repository root over HTTP and open the site in a browser.

**Option A — Python 3 (no install):**

```bash
python3 -m http.server 8000
```

**Option B — Node:**

```bash
npx serve -l 8000
```

Then open:

```
http://localhost:8000/index.html
```

Stop the server with `Ctrl+C`.

### Do not open the files directly

Double-clicking an `.html` file loads it over the `file://` protocol, which gives
the page a null origin. Every cross-origin `fetch()` is then rejected, so the
archive, blog, and student-profile lists all come up empty even though the rest
of the page renders. Always go through `http://localhost`.

## Pages

| File | Route | What it does |
| --- | --- | --- |
| `index.html` | Home | Landing page |
| `blog.html` | Blog | Post index, loaded from `GET /blog-posts` |
| `blog-post.html` | Blog post | Single post view |
| `archive.html` | Archive | Document browse and search, `GET /documents` and `GET /search` |
| `document.html` | Document view | Single document, `GET /documents` |
| `maps.html` | Maps | Map views |
| `about.html` | About | Team page, loaded from `GET /student-profiles` |
| `contact.html` | Contact | Placeholder, currently empty |

Shared assets:

- `config.js` — API and media base URLs, plus `mediaUrl()`, which resolves a
  record's `s3Key` against the allowed media origins. Must load before the other
  scripts.
- `shell.js` — renders the shared header, nav, and footer
- `posts.js` — blog post fetching and rendering
- `chat.js` — chat widget, talks to `POST /chat`
- `cite.js` — citation modal
- `style.css` — all site styling
- `images/` — static imagery committed to the repo

## Editing

Edit any `.html`, `.css`, or `.js` file and reload the browser. There is nothing
to rebuild or restart; the server only hands out files from disk. If a change
does not appear, do a hard reload (`Cmd+Shift+R` on macOS, `Ctrl+Shift+R`
elsewhere) to get past the browser cache.

## Pointing at a different backend

`config.js` holds `API_BASE_URL` and `MEDIA_BASE_URL`. To develop against another
stage or a local API, change `API_BASE_URL` and add the new media host to
`MEDIA_ALLOWED_ORIGINS` — `mediaUrl()` rejects any origin not on that list, so
images will silently fall back to placeholders if you skip that step.

Neither value is a secret: both are served to every visitor's browser. **Never put
API keys, AWS credentials, or signed URLs in `config.js`** or anywhere else in this
repository.

## Troubleshooting

**Pages render but every list is empty.** Open the browser console. If you see a
CORS error, the API Gateway response is missing an `Access-Control-Allow-Origin`
header for your local origin (`http://localhost:8000`). `fetch()` cannot tell a
CORS rejection apart from a dead network, so the on-page error message names both
causes. Fix it by adding your localhost origin to the API's allowed origins, or by
serving on a port that is already allowed.

**`Address already in use`.** Something else holds port 8000. Pick another port
(`python3 -m http.server 8001`) and use that in the URL.

**Images are missing but text loads.** The record's `s3Key` resolved to `null`,
which is `mediaUrl()`'s normal "no picture" answer, or the media host is not in
`MEDIA_ALLOWED_ORIGINS`.
