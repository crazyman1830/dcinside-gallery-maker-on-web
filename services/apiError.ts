export interface ApiErrorDetails {
  status?: number;
  code?: string;
  retryable?: boolean;
  requestId?: string;
  field?: string;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryable?: boolean;
  readonly requestId?: string;
  readonly field?: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status;
    this.code = details.code;
    this.retryable = details.retryable;
    this.requestId = details.requestId;
    this.field = details.field;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

export const readApiError = async (
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> => {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = (await response.json()) as unknown;
    if (isRecord(parsed)) payload = parsed;
  } catch {
    // Non-JSON responses still retain a safe status-based error.
  }

  const rawRetryAfter = response.headers.get('retry-after');
  const parsedRetryAfter = rawRetryAfter ? Number(rawRetryAfter) : Number.NaN;

  return new ApiError(
    optionalString(payload.error) ||
      optionalString(payload.message) ||
      `${fallbackMessage} (HTTP ${response.status})`,
    {
      status: response.status,
      code: optionalString(payload.code),
      retryable: typeof payload.retryable === 'boolean' ? payload.retryable : undefined,
      requestId: optionalString(payload.requestId),
      field: optionalString(payload.field),
      retryAfterSeconds:
        Number.isFinite(parsedRetryAfter) && parsedRetryAfter >= 0
          ? Math.ceil(parsedRetryAfter)
          : undefined,
    },
  );
};
