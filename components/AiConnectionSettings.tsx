import React, { useEffect, useState } from 'react';
import { AiProvider, VertexAuthMode } from '../types';
import {
  AiCredentialStatus,
  deleteAiCredential,
  getAiCredentialStatus,
  registerGeminiCredential,
  registerVertexAdc,
  registerVertexServiceAccount,
  testAiCredential,
} from '../services/aiCredentialClient';

interface AiConnectionSettingsProps {
  selectedProvider: AiProvider;
  selectedModel: string;
}

type ActionName = 'save-gemini' | 'save-vertex' | 'save-adc' | 'test' | 'delete';

interface Notice {
  tone: 'success' | 'error';
  message: string;
}

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.'
);

const getAuthModeLabel = (authMode?: VertexAuthMode): string => {
  if (authMode === 'service_account') return '서비스 계정 JSON';
  if (authMode === 'adc') return 'Application Default Credentials';
  return '확인되지 않음';
};

export const AiConnectionSettings: React.FC<AiConnectionSettingsProps> = ({
  selectedProvider,
  selectedModel,
}) => {
  const [status, setStatus] = useState<AiCredentialStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [activeAction, setActiveAction] = useState<ActionName | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [vertexAuthMode, setVertexAuthMode] = useState<VertexAuthMode>('service_account');
  const [vertexCredentials, setVertexCredentials] = useState('');
  const [vertexProjectId, setVertexProjectId] = useState('');

  const refreshStatus = async () => {
    const nextStatus = await getAiCredentialStatus();
    setStatus(nextStatus);
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoadingStatus(true);
      try {
        const nextStatus = await getAiCredentialStatus();
        if (isMounted) {
          setStatus(nextStatus);
          setNotice(null);
        }
      } catch (error) {
        if (isMounted) {
          setNotice({ tone: 'error', message: getErrorMessage(error) });
        }
      } finally {
        if (isMounted) setIsLoadingStatus(false);
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setGeminiApiKey('');
    setVertexCredentials('');
    setVertexProjectId('');
    setNotice(null);
  }, [selectedProvider]);

  const runAction = async (
    action: ActionName,
    operation: () => Promise<void>,
    successMessage: string,
  ) => {
    setActiveAction(action);
    setNotice(null);
    try {
      await operation();
      await refreshStatus();
      setNotice({ tone: 'success', message: successMessage });
    } catch (error) {
      setNotice({ tone: 'error', message: getErrorMessage(error) });
    } finally {
      setActiveAction(null);
    }
  };

  const handleGeminiSubmit = () => {
    const apiKey = geminiApiKey.trim();
    if (!apiKey) {
      setNotice({ tone: 'error', message: 'Gemini API 키를 입력해주세요.' });
      return;
    }

    // Clear secrets from React state before the network request begins.
    setGeminiApiKey('');
    void runAction(
      'save-gemini',
      () => registerGeminiCredential(apiKey),
      'Gemini API 키가 서버에 등록되었습니다.',
    );
  };

  const handleVertexServiceAccountSubmit = () => {
    const credentials = vertexCredentials.trim();
    if (!credentials) {
      setNotice({ tone: 'error', message: '서비스 계정 JSON을 입력하거나 파일을 선택해주세요.' });
      return;
    }

    // Keep the credential only for this request; never put it in a preset or browser storage.
    setVertexCredentials('');
    void runAction(
      'save-vertex',
      () => registerVertexServiceAccount(credentials),
      'Vertex AI 서비스 계정이 서버에 등록되었습니다.',
    );
  };

  const handleVertexAdcSubmit = () => {
    const projectId = vertexProjectId.trim();
    setVertexProjectId('');
    void runAction(
      'save-adc',
      () => registerVertexAdc(projectId),
      'Vertex AI ADC 설정이 서버에 등록되었습니다.',
    );
  };

  const handleCredentialFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > 64 * 1024) {
      setNotice({ tone: 'error', message: '서비스 계정 JSON 파일은 64KB 이하여야 합니다.' });
      return;
    }

    try {
      setVertexCredentials(await file.text());
      setNotice(null);
    } catch {
      setNotice({ tone: 'error', message: '자격증명 파일을 읽을 수 없습니다.' });
    }
  };

  const selectVertexAuthMode = (authMode: VertexAuthMode) => {
    setVertexAuthMode(authMode);
    setVertexCredentials('');
    setVertexProjectId('');
    setNotice(null);
  };

  const handleDelete = () => {
    const providerLabel = selectedProvider === 'gemini' ? 'Gemini' : 'Vertex AI';
    if (!window.confirm(`${providerLabel} 자격증명을 서버에서 삭제할까요?`)) return;

    void runAction(
      'delete',
      () => deleteAiCredential(selectedProvider),
      `${providerLabel} 자격증명이 삭제되었습니다.`,
    );
  };

  const selectedStatus = status?.providers[selectedProvider];
  const isBusy = activeAction !== null;
  const inputClass = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-colors text-sm';
  const primaryButtonClass = 'px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const secondaryButtonClass = 'px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4" aria-labelledby="ai-connection-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="ai-connection-title" className="text-sm font-bold text-slate-800">AI 연결 및 자격증명</h3>
          <p className="mt-1 text-xs text-slate-500">
            자격증명은 서버로만 전송되며 프리셋이나 브라우저 저장소에 보관하지 않습니다.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className={`h-2.5 w-2.5 rounded-full ${selectedStatus?.configured ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          {isLoadingStatus ? '상태 확인 중…' : selectedStatus?.configured ? '연결 설정됨' : '연결 필요'}
        </div>
      </div>

      {selectedProvider === 'gemini' ? (
        <div className="space-y-3">
          <label htmlFor="geminiApiKey" className="block text-sm font-bold text-slate-700">Gemini API 키</label>
          <input
            id="geminiApiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={geminiApiKey}
            onChange={(event) => setGeminiApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleGeminiSubmit();
              }
            }}
            placeholder="Google AI Studio API 키"
            className={inputClass}
          />
          <p className="text-xs text-slate-500">등록 후 입력란은 즉시 비워집니다. 기존 키는 화면에 다시 표시되지 않습니다.</p>
          <button type="button" onClick={handleGeminiSubmit} disabled={isBusy || !geminiApiKey.trim()} className={primaryButtonClass}>
            {activeAction === 'save-gemini' ? '등록 중…' : 'API 키 등록'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Vertex 인증 방식">
            <button
              type="button"
              onClick={() => selectVertexAuthMode('service_account')}
              className={`px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${vertexAuthMode === 'service_account' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
              aria-pressed={vertexAuthMode === 'service_account'}
            >
              서비스 계정 JSON
            </button>
            <button
              type="button"
              onClick={() => selectVertexAuthMode('adc')}
              className={`px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${vertexAuthMode === 'adc' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
              aria-pressed={vertexAuthMode === 'adc'}
            >
              ADC
            </button>
          </div>

          {vertexAuthMode === 'service_account' ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="vertexCredentialFile" className="block text-sm font-bold text-slate-700 mb-2">서비스 계정 키 파일</label>
                <input
                  id="vertexCredentialFile"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void handleCredentialFile(event)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-bold hover:file:bg-blue-100"
                />
              </div>
              <div>
                <label htmlFor="vertexCredentials" className="block text-sm font-bold text-slate-700 mb-2">또는 JSON 직접 붙여넣기</label>
                <textarea
                  id="vertexCredentials"
                  rows={4}
                  autoComplete="off"
                  spellCheck={false}
                  value={vertexCredentials}
                  onChange={(event) => setVertexCredentials(event.target.value)}
                  placeholder="서비스 계정 JSON 전체를 붙여넣으세요."
                  className={`${inputClass} resize-y font-mono`}
                />
              </div>
              <p className="text-xs text-amber-700">이 파일은 브라우저에 저장되지 않습니다. 등록 후 원본 키 파일은 프로젝트 폴더 밖에서 안전하게 관리하세요.</p>
              <button type="button" onClick={handleVertexServiceAccountSubmit} disabled={isBusy || !vertexCredentials.trim()} className={primaryButtonClass}>
                {activeAction === 'save-vertex' ? '등록 중…' : '서비스 계정 등록'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label htmlFor="vertexProjectId" className="block text-sm font-bold text-slate-700">Google Cloud 프로젝트 ID</label>
              <input
                id="vertexProjectId"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={vertexProjectId}
                onChange={(event) => setVertexProjectId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleVertexAdcSubmit();
                  }
                }}
                placeholder="비워두면 서버의 GOOGLE_CLOUD_PROJECT 사용"
                className={inputClass}
              />
              <p className="text-xs text-slate-500">입력값을 우선 사용하며, 비워두면 서버의 GOOGLE_CLOUD_PROJECT를 사용합니다. 서버에는 ADC 또는 연결된 서비스 계정이 준비되어 있어야 합니다.</p>
              <button type="button" onClick={handleVertexAdcSubmit} disabled={isBusy} className={primaryButtonClass}>
                {activeAction === 'save-adc' ? '등록 중…' : 'ADC 설정 등록'}
              </button>
            </div>
          )}

          {status?.providers.vertex.configured && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-white border border-slate-200 p-3 text-xs">
              <dt className="font-bold text-slate-500">인증 방식</dt>
              <dd className="text-slate-700">{getAuthModeLabel(status.providers.vertex.authMode)}</dd>
              {status.providers.vertex.projectId && (
                <>
                  <dt className="font-bold text-slate-500">프로젝트</dt>
                  <dd className="text-slate-700 break-all">{status.providers.vertex.projectId}</dd>
                </>
              )}
              {status.providers.vertex.location && (
                <>
                  <dt className="font-bold text-slate-500">리전</dt>
                  <dd className="text-slate-700">{status.providers.vertex.location}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          disabled={isBusy || !selectedStatus?.configured}
          onClick={() => void runAction(
            'test',
            () => testAiCredential(selectedProvider, selectedModel),
            '연결 테스트에 성공했습니다.',
          )}
          className={secondaryButtonClass}
        >
          {activeAction === 'test' ? '테스트 중…' : '연결 테스트'}
        </button>
        <button
          type="button"
          disabled={isBusy || !selectedStatus?.configured}
          onClick={handleDelete}
          className="px-4 py-2.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {activeAction === 'delete' ? '삭제 중…' : '자격증명 삭제'}
        </button>
        <button
          type="button"
          disabled={isBusy || isLoadingStatus}
          onClick={() => {
            setIsLoadingStatus(true);
            setNotice(null);
            void refreshStatus()
              .catch((error: unknown) => setNotice({ tone: 'error', message: getErrorMessage(error) }))
              .finally(() => setIsLoadingStatus(false));
          }}
          className={secondaryButtonClass}
        >
          상태 새로고침
        </button>
      </div>

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-lg px-3 py-2 text-sm ${notice.tone === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          {notice.message}
        </p>
      )}
    </section>
  );
};
