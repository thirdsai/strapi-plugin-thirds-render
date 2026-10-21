'use strict';

module.exports = ({ strapi }) => ({
  // POST /api/thirds-render/:uid/:documentId?format=pdf|png&locale=en&status=published&download=true
  async render(ctx) {
    const { uid, documentId } = ctx.params;
    const { format, locale, status, download } = ctx.query;
    const service = strapi.plugin('thirds-render').service('render');
    try {
      const result = await service.render({ uid, documentId, format, locale, status });
      if (download === 'true' || download === '1') {
        const file = await service.download(result.url);
        ctx.set('Content-Type', result.format === 'pdf' ? 'application/pdf' : 'image/png');
        ctx.set('Content-Disposition', `attachment; filename="${result.filename}"`);
        ctx.set('X-Thirds-Job-Id', result.jobId);
        ctx.body = file;
        return;
      }
      ctx.body = { data: result };
    } catch (err) {
      if (!err.status) throw err;
      ctx.status = err.status;
      ctx.body = { data: null, error: { status: err.status, name: 'ThirdsRenderError', message: err.message } };
    }
  },
});
