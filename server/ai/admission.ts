export class AiSessionBusyError extends Error {
  readonly status = 429;
  readonly code = 'AI_SESSION_BUSY';
  readonly retryAfterSeconds = 2;

  constructor() {
    super('이미 이 세션에서 AI 생성 작업이 진행 중입니다.');
    this.name = 'AiSessionBusyError';
  }
}

export class AiCapacityError extends Error {
  readonly status = 429;
  readonly code = 'AI_CAPACITY';
  readonly retryAfterSeconds = 2;

  constructor() {
    super('동시에 처리할 수 있는 AI 작업 수를 초과했습니다. 잠시 후 다시 시도해 주세요.');
    this.name = 'AiCapacityError';
  }
}

/**
 * Rejects excess work instead of queueing requests that may carry credentials
 * or outlive the browser tab that initiated them.
 */
export class AiAdmissionLimiter {
  private readonly activeSessions = new Set<string>();
  private activeJobs = 0;

  constructor(private readonly maxConcurrentJobs = 2) {
    if (!Number.isInteger(maxConcurrentJobs) || maxConcurrentJobs < 1) {
      throw new RangeError('maxConcurrentJobs must be a positive integer.');
    }
  }

  async run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    if (this.activeSessions.has(sessionId)) throw new AiSessionBusyError();
    if (this.activeJobs >= this.maxConcurrentJobs) throw new AiCapacityError();

    this.activeSessions.add(sessionId);
    this.activeJobs += 1;
    try {
      return await operation();
    } finally {
      this.activeSessions.delete(sessionId);
      this.activeJobs -= 1;
    }
  }

  get activeCount(): number {
    return this.activeJobs;
  }
}

export const aiAdmissionLimiter = new AiAdmissionLimiter();
