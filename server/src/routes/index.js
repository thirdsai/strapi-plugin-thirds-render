'use strict';

module.exports = {
  'content-api': {
    type: 'content-api',
    routes: [
      {
        // POST /api/thirds-render/:uid/:documentId?format=pdf|png&locale=&status=&download=true
        method: 'POST',
        path: '/:uid/:documentId',
        handler: 'render.render',
        config: { policies: [] },
      },
    ],
  },
};
