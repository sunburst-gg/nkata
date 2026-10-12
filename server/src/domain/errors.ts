// Typed errors with context. The app error handler turns these into ErrorBody responses.
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "gate_closed"
  | "lock_held"
  | "invalid_state"
  | "rights_required"
  | "chunks_missing"
  | "mail_failed";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gate_closed: 409,
  lock_held: 409,
  invalid_state: 409,
  rights_required: 409,
  chunks_missing: 422,
  mail_failed: 502,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function notFound(what: string, id: string): AppError {
  return new AppError("not_found", `${what} not found`, { id });
}
