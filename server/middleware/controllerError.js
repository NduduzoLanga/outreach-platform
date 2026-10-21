function respondWithControllerError(req, res, error, fallbackStatus = 500) {
  const validationError = ['ValidationError', 'CastError'].includes(error.name);
  const statusCode = error.statusCode || (validationError ? 400 : fallbackStatus);
  if (statusCode >= 500) {
    console.error({ requestId: req.id, error });
  }
  const message = error.statusCode || validationError
    ? error.message
    : 'Internal server error.';
  return res.status(statusCode).json({ message, requestId: req.id });
}

module.exports = { respondWithControllerError };
