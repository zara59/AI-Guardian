export class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = statusCode;
    this.code = code;
  }
}

export function ok(res, data, meta) {
  return res.status(200).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function created(res, data) {
  return res.status(201).json({ success: true, data });
}