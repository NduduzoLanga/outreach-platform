const { AsyncLocalStorage } = require('node:async_hooks');

const tenantContext = new AsyncLocalStorage();

function bindTenant(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: 'Your account is not assigned to an agency.' });
  }
  req.tenantId = req.user.tenantId;
  return tenantContext.run(String(req.tenantId), next);
}

module.exports = { tenantContext, bindTenant };
