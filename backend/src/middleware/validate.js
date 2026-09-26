function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse ? schema.safeParse(req.body || {}) : null;

    if (!result || !result.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.'
      });
    }

    req.body = result.data;
    return next();
  };
}

module.exports = { validateBody };
