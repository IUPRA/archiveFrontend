// Frontend configuration.
//
// This is a PUBLIC API Gateway URL, not a secret. No API keys, AWS credentials,
// or signed material belong in this file — it is served to every browser.
//
// Loaded as a CLASSIC script (not type="module") because archive.html relies on
// inline onclick= handlers, which can only see global bindings. A top-level
// `const` in a classic script is a global lexical binding, so later classic
// scripts on the page can read API_BASE_URL directly.
const API_BASE_URL = "https://u8er0k8ohg.execute-api.us-east-2.amazonaws.com";


// CloudFront distribution in front of the media bucket. Public, like the API
// URL above, and not a secret: it is the host every visitor's browser fetches
// portraits and post images from. No trailing slash.
//
// Records carry `s3Key` (e.g. "profiles/1/1.png"), which is a bucket key, not a
// URL, so a browser cannot fetch it on its own. mediaUrl() joins the two.
const MEDIA_BASE_URL = "https://dz4hks7o1guz1.cloudfront.net";

// Origins an image is allowed to load from.
//
// This is the security boundary, and the reason mediaUrl() does not simply
// trust whatever a record contains. Profile and post records are authored
// elsewhere, so the browser treats their contents as untrusted input: without
// this list, any absolute URL written into an `s3Key` field would become an
// <img src> pointing wherever the author chose, which leaks every visitor's IP
// and User-Agent to that host on page load and makes the archive a vector for
// third-party tracking. Keys resolved against MEDIA_BASE_URL cannot leave the
// distribution; absolute URLs are honoured only for the hosts listed here.
//
// Add the bucket's regional S3 origin here too if the API ever starts handing
// out presigned URLs.
const MEDIA_ALLOWED_ORIGINS = [
  "https://dz4hks7o1guz1.cloudfront.net",
];

/**
 * Resolve a record's image reference to a URL an <img> may load, or null.
 *
 * Returning null is the normal "no picture" answer, not an error: the pages
 * fall back to their own placeholder rather than requesting a broken image.
 *
 * Accepts either a bucket key, which is joined onto MEDIA_BASE_URL with each
 * path segment encoded so "/" stays a separator while spaces and other literal
 * characters are escaped, or an absolute https URL on an allowed origin.
 * Everything else is rejected, including http, protocol-relative "//host/x",
 * and javascript: or data: payloads.
 */
function mediaUrl(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw) return null;

  // Protocol-relative references inherit the page's scheme and would otherwise
  // slip past the key path as a host. Never a valid bucket key.
  if (raw.startsWith('//')) return null;

  // Absolute URL: allowed only over https, only on a listed origin.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:') return null;
      return MEDIA_ALLOWED_ORIGINS.includes(u.origin) ? u.href : null;
    } catch {
      return null;
    }
  }

  // Otherwise a bucket key.
  if (!MEDIA_BASE_URL) return null;
  const path = raw.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  try {
    const u = new URL(path, `${MEDIA_BASE_URL.replace(/\/+$/, '')}/`);
    // Defence in depth: a key can never resolve off the distribution.
    return u.origin === new URL(MEDIA_BASE_URL).origin ? u.href : null;
  } catch {
    return null;
  }
}


// ── Archival PDFs ─────────────────────────────────────────────────────────
//
// Scans live in the archive bucket under
//   archival-documents/<documentId>/pdf/<filename>.pdf
// and are served through the CloudFront distribution above. The bucket's own
// s3.<region>.amazonaws.com URLs answer 403, so a record holding one of those
// is rewritten to a key and resolved through the distribution instead.
const ARCHIVE_PDF_PREFIX = "archival-documents";

const ARCHIVE_S3_HOSTS = [
  "irp-archive-776051123145-us-east-2-an.s3.us-east-2.amazonaws.com",
];

// Per-document filenames, because the filename cannot be worked out from the
// record: it is human-chosen ("Austin Originals.pdf"), the bucket denies
// listing, and CloudFront sends no CORS headers, so the page cannot discover or
// test-fetch it. This map is a stopgap, not the design.
//
// Delete an entry as soon as its record carries the key itself (any of
// pdfKey / s3PdfKey / s3MasterKey, which take precedence over this map), or
// set PDF_ASSUME_CONVENTION below and name the files after their documentId to
// stop needing per-document data at all.
const PDF_KEY_OVERRIDES = {
  "irp-books-000001": "archival-documents/irp-books-000001/pdf/Pease Porridge Hot.pdf",
  "irp-books-000002": "archival-documents/irp-books-000002/pdf/Austin Originals.pdf",
};

// When true, a document with no recorded key is assumed to live at
// archival-documents/<documentId>/pdf/<documentId>.pdf.
//
// Left false deliberately: today's files are not named that way, and a wrong
// guess puts CloudFront's AccessDenied XML inside the PDF viewer, which reads
// as a broken page. With no CORS the guess cannot be checked first, so an
// unrecorded document shows its metadata instead of a broken viewer. Flip this
// to true once uploads are named after the documentId.
const PDF_ASSUME_CONVENTION = false;

// ── Datasets ──────────────────────────────────────────────────────────────
//
// Tabular data (the cleaned census spreadsheets) lives under
//   datasets/<documentId>/<documentId>.xlsx
// on the same distribution. It has its own top-level prefix so the Bedrock
// Knowledge Base, whose data source is scoped to the literal `text/` prefix,
// never ingests a spreadsheet: rows retrieve poorly as prose.
//
// Unlike the PDFs there is no override map and no convention guessing here,
// because the admin tool writes `s3DatasetKey` onto every record at upload
// time. If that key is absent the archive genuinely has no file.
const ARCHIVE_DATASET_PREFIX = "datasets";

/**
 * The URL of a document's dataset file, or null when there is none.
 *
 * Goes through mediaUrl(), so the result is always on the allowed distribution
 * and a hostile absolute URL in the record cannot redirect a download.
 */
function archiveDatasetUrl(it) {
  const recorded = it.s3DatasetKey ?? it.datasetKey ?? it.s3DataKey;
  if (!recorded) return null;
  return mediaUrl(archiveKey(recorded));
}

/**
 * Rewrite an archive-bucket URL to a plain bucket key; pass anything else
 * through unchanged. Lets a record store either form.
 */
function archiveKey(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (ARCHIVE_S3_HOSTS.includes(u.host)) {
      // S3 renders a space in a key as "+" in some console links.
      return decodeURIComponent(u.pathname.replace(/^\/+/, '').replace(/\+/g, '%20'));
    }
    return raw;
  } catch {
    return raw;  // not a URL, so already a key
  }
}

/**
 * The URL of a document's PDF, or null when the archive has no file for it.
 *
 * Order: a key recorded on the document, then the override map, then the
 * documentId convention if PDF_ASSUME_CONVENTION is on. Everything goes through
 * mediaUrl(), so the result is always on the allowed distribution.
 */
function archivePdfUrl(it) {
  const recorded = it.pdfUrl ?? it.pdfKey ?? it.s3PdfKey ?? it.s3MasterKey;
  if (recorded) {
    const url = mediaUrl(archiveKey(recorded));
    if (url) return url;
  }

  const id = String(it.documentId ?? '').trim();
  if (!id) return null;

  if (PDF_KEY_OVERRIDES[id]) return mediaUrl(PDF_KEY_OVERRIDES[id]);
  if (PDF_ASSUME_CONVENTION) return mediaUrl(`${ARCHIVE_PDF_PREFIX}/${id}/pdf/${id}.pdf`);
  return null;
}


// ── Ask the Archive (chatbot) ─────────────────────────────────────────────
//
// The RAG backend is a Bedrock Knowledge Base, which a browser cannot call:
// Bedrock requires SigV4-signed requests, and no AWS credential belongs in a
// page served to the public. So a Lambda sits in front of it and this is the
// route the widget posts to.
//
// Until that route exists CHAT_MOCK stays true and chat.js answers from a
// canned script, so the interface can be designed, reviewed and corrected
// without waiting on the backend. Flipping this to false is the only change
// needed on this side once /chat is live.
const CHAT_API_URL = `${API_BASE_URL}/chat`;
const CHAT_MOCK = true;

// The contract, confirmed against the live knowledge base on 2026-10-08:
//
//   POST { question, sessionId? }
//   ->   { answer, sessionId, sources: [ { documentId, title?, page? } ] }
//
// `sessionId` comes back from Bedrock's RetrieveAndGenerate and carries the
// conversation, so the widget stores it and returns it on the next turn rather
// than resending the transcript.
//
// `sources` is derivable even though the knowledge base currently has no
// metadata sidecars: a retrieved chunk's S3 URI is
// archival-documents/{documentId}/... or datasets/{documentId}/..., and the
// page number arrives as x-amz-bedrock-kb-document-page-number. The Lambda
// should map those into this shape so the browser never parses S3 keys.

// Opening prompts. Drawn from material actually in the collection, because a
// blank box over an unfamiliar archive gives a visitor nothing to start from.
const CHAT_SUGGESTIONS = [
  "What does the archive hold about the Pease family?",
  "Which census years are available for Bastrop County?",
  "What records document slavery in Bastrop County?",
];
