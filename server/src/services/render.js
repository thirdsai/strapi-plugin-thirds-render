'use strict';

const crypto = require('node:crypto');

const PLUGIN = 'thirds-render';
const SYSTEM_FIELDS = new Set(['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy', 'locale', 'localizations']);
const SKIP_TYPES = new Set(['password', 'relation', 'media', 'component', 'dynamiczone']);
const TITLE_FIELDS = ['title', 'name', 'heading', 'label', 'subject'];
const SUMMARY_FIELDS = ['description', 'summary', 'excerpt', 'subtitle', 'intro'];

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const humanize = (name) => {
  const words = String(name).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const safeUrl = (u) => (/^(https?:|mailto:)/i.test(String(u || '')) ? String(u) : '#');

// Strapi 5 "blocks" rich text to HTML. Images are left out unless their URL is absolute.
function blocksToHtml(nodes) {
  if (!Array.isArray(nodes)) return '';
  const inline = (children) =>
    (children || [])
      .map((c) => {
        if (c.type === 'link') return `<a href="${esc(safeUrl(c.url))}">${inline(c.children)}</a>`;
        let t = esc(c.text).replace(/\n/g, '<br>');
        if (c.code) t = `<code>${t}</code>`;
        if (c.bold) t = `<strong>${t}</strong>`;
        if (c.italic) t = `<em>${t}</em>`;
        if (c.underline) t = `<u>${t}</u>`;
        if (c.strikethrough) t = `<s>${t}</s>`;
        return t;
      })
      .join('');
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'heading': {
          const level = Math.min(Math.max(Number(n.level) || 2, 2), 6);
          return `<h${level}>${inline(n.children)}</h${level}>`;
        }
        case 'list': {
          const tag = n.format === 'ordered' ? 'ol' : 'ul';
          return `<${tag}>${(n.children || []).map((li) => `<li>${inline(li.children)}</li>`).join('')}</${tag}>`;
        }
        case 'quote':
          return `<blockquote>${inline(n.children)}</blockquote>`;
        case 'code':
          return `<pre><code>${inline(n.children)}</code></pre>`;
        case 'image':
          return n.image && /^https:\/\//.test(n.image.url || '')
            ? `<img src="${esc(n.image.url)}" alt="${esc(n.image.alternativeText || '')}">`
            : '';
        default:
          return `<p>${inline(n.children)}</p>`;
      }
    })
    .join('');
}

// Markdown rich text is printed as escaped paragraphs, so no HTML from the entry reaches the page.
const textToHtml = (s) =>
  String(s || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

function fieldHtml(attr, value) {
  if (value == null || value === '') return '';
  switch (attr.type) {
    case 'blocks':
      return blocksToHtml(value);
    case 'richtext':
    case 'text':
      return textToHtml(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'json':
      return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
    default:
      return esc(value);
  }
}

function pick(entry, names) {
  for (const n of names) if (typeof entry[n] === 'string' && entry[n].trim()) return entry[n].trim();
  return '';
}

// The built in template: every visible scalar field of the entry, in schema order. Private fields, passwords,
// relations, media and components are left out. Pass your own template in the plugin config for a custom layout.
function defaultTemplate({ entry, format, contentType }) {
  const title = pick(entry, TITLE_FIELDS) || `${contentType.info.displayName} ${entry.documentId}`;
  const summary = pick(entry, SUMMARY_FIELDS);
  const fields = Object.entries(contentType.attributes)
    .filter(([name, attr]) => !SYSTEM_FIELDS.has(name) && !SKIP_TYPES.has(attr.type) && !attr.private)
    .filter(([name]) => !TITLE_FIELDS.includes(name) || entry[name] !== title);

  if (format === 'png') {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%}
body{display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;padding:64px 72px;
background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;font-family:Helvetica,Arial,sans-serif}
.type{font-size:26px;letter-spacing:3px;text-transform:uppercase;opacity:.75}
h1{font-size:64px;line-height:1.1;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
p{font-size:30px;line-height:1.35;margin:24px 0 0;opacity:.9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
</style></head><body><div class="type">${esc(contentType.info.displayName)}</div>
<div><h1>${esc(title)}</h1>${summary ? `<p>${esc(summary)}</p>` : ''}</div><div></div></body></html>`;
  }

  const rows = fields
    .map(([name, attr]) => {
      const html = fieldHtml(attr, entry[name]);
      return html ? `<section><h2 class="label">${esc(humanize(name))}</h2><div class="value">${html}</div></section>` : '';
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:18mm 16mm}
body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#1f2937;margin:0}
.type{font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280}
h1{font-size:24pt;line-height:1.2;margin:2mm 0 8mm}
section{margin:0 0 6mm;break-inside:avoid-page}
h2.label{font-size:8.5pt;letter-spacing:1px;text-transform:uppercase;color:#6b7280;margin:0 0 1.5mm;font-weight:normal}
.value h2{font-size:15pt;margin:4mm 0 2mm}.value h3{font-size:13pt;margin:3mm 0 1.5mm}
.value p{margin:0 0 2.5mm}.value pre{white-space:pre-wrap;background:#f3f4f6;padding:3mm;font-size:9pt}
blockquote{margin:0 0 3mm;padding-left:4mm;border-left:3px solid #d1d5db;color:#4b5563}
img{max-width:100%}
</style></head><body><div class="type">${esc(contentType.info.displayName)}</div><h1>${esc(title)}</h1>${rows}</body></html>`;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = ({ strapi }) => ({
  settings() {
    const cfg = (key) => strapi.plugin(PLUGIN).config(key);
    return {
      apiKey: cfg('apiKey') || process.env.THIRDS_API_KEY || '',
      baseUrl: String(cfg('baseUrl') || 'https://thirds.ai').replace(/\/+$/, ''),
      contentTypes: cfg('contentTypes') || [],
      allowDrafts: !!cfg('allowDrafts'),
      defaultFormat: cfg('defaultFormat') || 'pdf',
      templates: cfg('templates') || {},
      pdf: cfg('pdf') || {},
      image: cfg('image') || {},
      timeoutMs: Number(cfg('timeoutMs')) || 60000,
    };
  },

  defaultTemplate,

  // Builds the request for an entry without calling the API. Same entry, same body, same Idempotency-Key.
  async buildRequest({ uid, documentId, format, locale, status }) {
    const s = this.settings();
    format = format || s.defaultFormat;
    if (!['pdf', 'png'].includes(format)) throw httpError(400, 'format must be pdf or png');
    if (!s.contentTypes.includes(uid)) {
      throw httpError(403, `Content type ${uid} is not enabled for rendering. Add it to contentTypes in the thirds-render plugin config.`);
    }
    const contentType = strapi.contentType(uid);
    if (!contentType) throw httpError(404, `Unknown content type ${uid}`);
    status = status || 'published';
    if (!['published', 'draft'].includes(status)) throw httpError(400, 'status must be published or draft');
    if (status === 'draft' && !s.allowDrafts) throw httpError(403, 'Rendering drafts is turned off (allowDrafts)');

    const query = { documentId, status };
    if (locale) query.locale = locale;
    const entry = await strapi.documents(uid).findOne(query);
    if (!entry) throw httpError(404, 'Entry not found');

    const template = s.templates[uid] || defaultTemplate;
    const html = await template({ entry, format, contentType });
    if (typeof html !== 'string' || !html.trim()) throw httpError(500, `The template for ${uid} returned no HTML`);

    const title = pick(entry, TITLE_FIELDS) || `${contentType.info.displayName} ${entry.documentId}`;
    const body =
      format === 'pdf'
        ? { html, wait: true, pdf: { ...s.pdf, title } }
        : { html, wait: true, image: { width: 1200, height: 630, ...s.image, format: 'png' } };
    const json = JSON.stringify(body);
    // uid, documentId, locale, status, updatedAt and format identify the version; the body hash covers template changes.
    const idempotencyKey =
      'strapi-' +
      sha256([uid, entry.documentId, entry.locale || '', status, entry.updatedAt || '', format, sha256(json)].join('|')).slice(0, 48);
    const slug = (typeof entry.slug === 'string' && entry.slug) || entry.documentId;
    return { format, entry, json, idempotencyKey, filename: `${String(slug).replace(/[^\w.-]+/g, '-')}.${format}` };
  },

  async call(path, init = {}) {
    const s = this.settings();
    if (!s.apiKey) throw httpError(500, 'thirds-render: no API key. Set THIRDS_API_KEY in the environment.');
    const res = await fetch(s.baseUrl + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${s.apiKey}` },
      signal: AbortSignal.timeout(s.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && data.error && (data.error.message || data.error.code)) || `HTTP ${res.status}`;
      throw httpError(res.status >= 500 ? 502 : res.status === 401 || res.status === 403 ? 502 : res.status, `thirds.ai: ${msg}`);
    }
    return data;
  },

  // Renders one entry. Returns the job and an absolute, signed download link (valid for about 15 minutes, no key needed).
  async render({ uid, documentId, format, locale, status }) {
    const s = this.settings();
    const req = await this.buildRequest({ uid, documentId, format, locale, status });
    const kind = req.format === 'pdf' ? 'pdf' : 'image';
    let job = await this.call(`/v1/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': req.idempotencyKey },
      body: req.json,
    });
    const deadline = Date.now() + s.timeoutMs;
    while (job && (job.status === 'queued' || job.status === 'running') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      job = await this.call(`/v1/${kind}/${encodeURIComponent(job.id)}`);
    }
    if (!job || job.status !== 'succeeded' || !job.download || !job.download.url) {
      throw httpError(502, `thirds.ai: render did not finish (${job ? job.status : 'no job'})`);
    }
    // download.url is relative, e.g. /v1/downloads/...; put the API host in front of it.
    const url = /^https?:\/\//.test(job.download.url) ? job.download.url : s.baseUrl + job.download.url;
    return {
      format: req.format,
      jobId: job.id,
      status: job.status,
      url,
      filename: req.filename,
      idempotencyKey: req.idempotencyKey,
      artifact: job.artifact ? { byteSize: job.artifact.byte_size, sha256: job.artifact.sha256 } : null,
    };
  },

  // Fetches the rendered file through the signed link. The link needs no API key.
  async download(url) {
    const s = this.settings();
    const res = await fetch(url, { signal: AbortSignal.timeout(s.timeoutMs) });
    if (!res.ok) throw httpError(502, `thirds.ai: download failed (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  },
});
