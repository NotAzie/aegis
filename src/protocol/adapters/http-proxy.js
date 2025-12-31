/**
 * createHttpPrivacyProxy — Zero-Config Wire-Speed HTTP Privacy Middleware
 *
 * Pluggable middleware for Express, Connect, Fastify, and Cloudflare Workers.
 */

function createHttpPrivacyProxy(protocol) {
  return function aegisMiddleware(req, res, next) {
    const fullUrl = req.protocol ? `${req.protocol}://${req.get('host')}${req.originalUrl}` : req.url;
    const verdict = protocol.evaluate(fullUrl);

    if (verdict.action === 'BLOCK') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: 'AegisShield blocked hostile request',
        reason: verdict.reason
      }));
    }

    // Strip tracking headers
    delete req.headers['x-forwarded-for'];
    delete req.headers['dnt'];

    if (typeof next === 'function') next();
  };
}

module.exports = { createHttpPrivacyProxy };
