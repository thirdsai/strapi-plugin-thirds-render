(Disclosure: I'm connected to thirds.ai.)
Drafted with AI help.

# strapi-plugin-thirds-render

A Strapi 5 plugin that renders a content entry to a PDF or a PNG with the thirds.ai hosted render API. One authenticated request to your Strapi API returns a signed download link, or the file itself.

Requires a thirds.ai account and API key.

```
POST /api/thirds-render/:uid/:documentId?format=pdf|png
```

Use it for a printable version of an article, an invoice or certificate stored as a content type, or a 1200x630 social card for every entry. The page is built from HTML, so your own template can use any CSS that a modern browser understands, and the rendering happens on the thirds.ai side, with no headless browser inside your Strapi server.

* Server only: a service, a controller and one Content API route. No admin panel changes.
* The API key is read from your environment only, never from code or the request.
* Only the content types you list can be rendered, and only published content unless you turn drafts on.
* A stable `Idempotency-Key` per entry version: calling the route again for an unchanged entry returns the same file without a new render. Editing the entry (its `updatedAt`) or the template makes a new one.
* A built in template for any content type, or your own template function per content type.

## Install

From a local copy or the GitHub repository:

```sh
npm install /path/to/strapi-plugin-thirds-render
# or: npm install github:thirdsai/strapi-plugin-thirds-render
```

The package has `strapi.kind: plugin`, so Strapi picks it up from your dependencies. Restart Strapi after installing.

## Configure

`config/plugins.js`:

```js
module.exports = ({ env }) => ({
  'thirds-render': {
    enabled: true,
    config: {
      apiKey: env('THIRDS_API_KEY'),            // from the environment, never a literal
      contentTypes: ['api::article.article'],   // what may be rendered
      // allowDrafts: false,                    // allow ?status=draft
      // defaultFormat: 'pdf',                  // 'pdf' or 'png'
      // pdf: { format: 'A4' },                 // passed to the API as pdf options
      // image: { width: 1200, height: 630 },   // PNG size
      // templates: { 'api::article.article': ({ entry, format, contentType }) => '<!doctype html>...' },
    },
  },
});
```

Put `THIRDS_API_KEY=...` in your `.env` or your host's environment settings. If `apiKey` is not set in the config, the plugin reads `process.env.THIRDS_API_KEY`. The key is sent only to the thirds.ai API as a Bearer token and is never logged or returned.

## Permissions

The route is a Content API route, so every request needs a Strapi API token or a logged in user whose role allows the action `plugin::thirds-render.render.render` (plugin `thirds-render`, controller `render`, action `render`). Without it Strapi answers 403 Forbidden.

**API token** (for servers, scripts and other backends):

1. Settings, then API Tokens, then Create new API Token.
2. Token type **Custom**. In Permissions, open **thirds-render**, then **render**, and tick **render**. Add any other actions the token needs.
3. Save, copy the token, and send it as `Authorization: Bearer <token>`.

A **Full access** token also works. A **Read-only** token does not, because it only covers find actions.

**Users & Permissions role** (for logged in end users):

1. Settings, then Users & Permissions plugin, then Roles, then the role, for example **Authenticated**.
2. In Permissions, open **thirds-render** and tick **render**, then Save.
3. Users log in with `POST /api/auth/local` and send the returned JWT as `Authorization: Bearer <jwt>`.

Every new render uses credits on the thirds.ai account behind the key, so do not tick render for the **Public** role unless you mean it.

## Use

```sh
# JSON with a signed link (valid for about 15 minutes, no key needed to download)
curl -X POST -H "Authorization: Bearer $STRAPI_TOKEN" \
  "http://localhost:1337/api/thirds-render/api::article.article/$DOCUMENT_ID?format=pdf"

# The file itself, as an attachment
curl -X POST -H "Authorization: Bearer $STRAPI_TOKEN" -o article.png \
  "http://localhost:1337/api/thirds-render/api::article.article/$DOCUMENT_ID?format=png&download=true"
```

Query parameters:

| Parameter | Values | Default |
|---|---|---|
| `format` | `pdf`, `png` | `defaultFormat` |
| `download` | `true` to return the file instead of JSON | off |
| `locale` | an i18n locale such as `fr` | default locale |
| `status` | `published`, `draft` (needs `allowDrafts`) | `published` |

JSON response:

```json
{
  "data": {
    "format": "pdf",
    "jobId": "pdf_...",
    "status": "succeeded",
    "url": "https://thirds.ai/v1/downloads/...",
    "filename": "release-notes-october.pdf",
    "idempotencyKey": "strapi-...",
    "artifact": { "byteSize": 23325, "sha256": "..." }
  }
}
```

The API returns the download link as a relative path; the plugin puts `https://thirds.ai` in front of it. The link is signed and expires after about 15 minutes, so store the file (for example in the Media Library) rather than the link if you need it later.

With i18n, pass `locale` to render a localized version, for example `?locale=fr`. Each locale is a separate version with its own Idempotency-Key, and a locale that has no version of the entry returns 404. Turning on localization for a content type that already has entries changes their key once (the entry gains a locale), so the next render of each entry makes a new file.

Errors come back as `{ data: null, error: { status, name: "ThirdsRenderError", message } }`: 400 for a bad format or status, 403 for a content type that is not enabled or a draft when drafts are off, 404 for an unknown entry, and 502 when the render API fails.

## From your own code

The service works without the route, for example in a lifecycle hook or a cron task:

```js
const render = strapi.plugin('thirds-render').service('render');
const { url, filename } = await render.render({ uid: 'api::article.article', documentId, format: 'pdf' });
const pdf = await render.download(url); // a Buffer
```

## Templates

The built in template prints the entry title (the first of `title`, `name`, `heading`, `label`, `subject`) and every other field in schema order. Text and Markdown fields are printed as escaped text, and Strapi "blocks" rich text is turned into headings, paragraphs, lists, quotes, code and links. Fields marked private, passwords, relations, media and components are left out. For PNG it makes a 1200x630 card with the content type name, the title and a summary (`description`, `summary`, `excerpt`, `subtitle` or `intro`).

For your own layout, add a function per content type. It gets the entry (published, without relations unless you load them yourself), the format and the content type schema, and returns a full HTML document. Escape every value you print:

```js
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// inside the thirds-render config:
templates: {
  'api::certificate.certificate': ({ entry, format }) => `<!doctype html><html><head><meta charset="utf-8">
    <style>@page{size:A4 landscape;margin:0} body{font-family:Georgia,serif;text-align:center;padding:30mm}</style>
    </head><body><h1>Certificate of completion</h1><p>${escapeHtml(entry.name)}</p></body></html>`,
},
```

The PDF title (document properties) is set to the entry title.

## How the Idempotency-Key is made

`strapi-` plus the first 48 hex characters of a SHA-256 over the content type uid, documentId, locale, status, `updatedAt`, format and a SHA-256 of the exact request body. The same entry version with the same template and options always gives the same key, so retries and repeated clicks return the existing file.

## Requirements

Strapi 5 and Node 20 or later (the plugin uses the built in `fetch`). No other dependencies.

## License

MIT

thirds.ai: https://thirds.ai/?utm_source=strapi&utm_medium=community&utm_campaign=own-content&utm_content=strapi-plugin
