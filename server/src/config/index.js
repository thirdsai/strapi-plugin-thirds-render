'use strict';

const FORMATS = ['pdf', 'png'];

module.exports = {
  default: {
    // Read the key from the environment in config/plugins.js: apiKey: env('THIRDS_API_KEY').
    // If it is not set here, process.env.THIRDS_API_KEY is used.
    apiKey: undefined,
    baseUrl: 'https://thirds.ai',
    // Content types that may be rendered, e.g. ['api::article.article']. Nothing is rendered until you list one.
    contentTypes: [],
    // Allow ?status=draft. Off by default, so the route only ever renders published content.
    allowDrafts: false,
    defaultFormat: 'pdf',
    // Optional HTML templates per content type: { 'api::article.article': ({ entry, format, contentType }) => '<html>...' }
    templates: {},
    pdf: { format: 'A4' },
    image: { width: 1200, height: 630 },
    timeoutMs: 60000,
  },
  validator(config) {
    if (config.apiKey !== undefined && config.apiKey !== null && typeof config.apiKey !== 'string') {
      throw new Error('apiKey must be a string (read it from the environment)');
    }
    if (!Array.isArray(config.contentTypes)) throw new Error('contentTypes must be an array of content type uids');
    if (!FORMATS.includes(config.defaultFormat)) throw new Error(`defaultFormat must be one of ${FORMATS.join(', ')}`);
    for (const [uid, fn] of Object.entries(config.templates || {})) {
      if (typeof fn !== 'function') throw new Error(`templates['${uid}'] must be a function that returns HTML`);
    }
    if (!/^https:\/\//.test(config.baseUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(config.baseUrl)) {
      throw new Error('baseUrl must be an https URL');
    }
  },
};
