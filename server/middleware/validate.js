const { ApiError } = require('./errorHandler');

// Validates req.body (or another source) with a Zod schema and replaces it with the parsed value.
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new ApiError(400, 'Validation failed', details));
  }
  req[source] = result.data;
  next();
};

module.exports = validate;
