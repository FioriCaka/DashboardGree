export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(message = "Not found") {
  return new HttpError(404, message);
}

export function errorHandler(error, _req, res, _next) {
  const isValidationError = error.name === "ZodError";
  const status = error.status ?? (isValidationError ? 422 : 500);
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({
    message: isValidationError ? "Validation failed" : error.message ?? "Server error",
    details: error.details ?? error.issues,
  });
}
