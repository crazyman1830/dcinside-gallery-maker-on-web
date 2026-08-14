import { randomUUID } from 'node:crypto';
import type { AiProvider, VertexAuthMode } from '../types';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1_000;
export const DEFAULT_MAX_SESSIONS = 128;

export interface ServiceAccountCredential {
  type: 'service_account';
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

export type StoredVertexCredential =
  | {
      authMode: 'service_account';
      projectId: string;
      location: 'global';
      credentials: ServiceAccountCredential;
    }
  | {
      authMode: 'adc';
      projectId: string;
      location: 'global';
    };

export interface SessionCredentials {
  id: string;
  lastAccess: number;
  gemini?: { apiKey: string };
  vertex?: StoredVertexCredential;
}

export interface CredentialStatus {
  providers: {
    gemini: { configured: boolean };
    vertex: {
      configured: boolean;
      authMode?: VertexAuthMode;
      projectId?: string;
      location?: 'global';
    };
  };
}

export class SessionCredentialStore {
  private readonly sessions = new Map<string, SessionCredentials>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = SESSION_TTL_MS,
    private readonly maxEntries: number = DEFAULT_MAX_SESSIONS,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('maxEntries must be a positive integer.');
    }
  }

  create(): SessionCredentials {
    this.ensureCapacity();
    const session: SessionCredentials = {
      id: randomUUID(),
      lastAccess: this.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): SessionCredentials | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (this.now() - session.lastAccess >= this.ttlMs) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    session.lastAccess = this.now();
    return session;
  }

  getOrCreate(sessionId?: string): SessionCredentials {
    return (sessionId ? this.get(sessionId) : undefined) ?? this.create();
  }

  setGemini(sessionId: string, apiKey: string): void {
    const session = this.require(sessionId);
    session.gemini = { apiKey };
  }

  setVertex(sessionId: string, credential: StoredVertexCredential): void {
    const session = this.require(sessionId);
    session.vertex = credential;
  }

  deleteProvider(sessionId: string, provider: AiProvider): boolean {
    const session = this.get(sessionId);
    if (!session) return false;
    const wasConfigured = Boolean(session[provider]);
    delete session[provider];
    return wasConfigured;
  }

  status(sessionId: string): CredentialStatus {
    const session = this.require(sessionId);
    return {
      providers: {
        gemini: { configured: Boolean(session.gemini) },
        vertex: session.vertex
          ? {
              configured: true,
              authMode: session.vertex.authMode,
              projectId: session.vertex.projectId,
              location: session.vertex.location,
            }
          : { configured: false },
      },
    };
  }

  cleanupExpired(): number {
    const before = this.sessions.size;
    for (const [sessionId, session] of this.sessions) {
      if (this.now() - session.lastAccess >= this.ttlMs) this.sessions.delete(sessionId);
    }
    return before - this.sessions.size;
  }

  clear(): void {
    this.sessions.clear();
  }

  get size(): number {
    return this.sessions.size;
  }

  private require(sessionId: string): SessionCredentials {
    const session = this.get(sessionId);
    if (!session) throw new Error('로컬 세션이 만료되었습니다. 페이지를 새로고침해 주세요.');
    return session;
  }

  private ensureCapacity(): void {
    this.cleanupExpired();
    if (this.sessions.size < this.maxEntries) return;

    let evictionCandidate: SessionCredentials | undefined;
    for (const session of this.sessions.values()) {
      if (!evictionCandidate || session.lastAccess < evictionCandidate.lastAccess) {
        evictionCandidate = session;
      }
    }
    if (evictionCandidate) this.sessions.delete(evictionCandidate.id);
  }
}

export const sessionCredentialStore = new SessionCredentialStore();
