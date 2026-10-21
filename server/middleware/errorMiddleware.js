function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404);
  next(error);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
  if (statusCode === 500) {
    console.error({ requestId: req.id, error });
  }

  res.status(statusCode).json({
    message: statusCode === 500 ? 'Internal server error.' : error.message || 'Request failed.',
    requestId: req.id,
  });
}

module.exports = { notFound, errorHandler };
