# DCInside Gallery Generator

주제와 세계관 설정을 바탕으로 게시글, 댓글, 반응을 생성하는 React 애플리케이션입니다. Google AI Studio의 Gemini API와 Google Cloud Vertex AI를 모두 지원하며, AI 호출과 자격 증명 처리는 Node.js 서버에서만 수행합니다.

## 주요 기능

- 게시글과 댓글을 스트리밍으로 생성
- 세계관, 시대, 말투, 사용자 성향 등 세부 조건 설정
- 사용자 글과 댓글에 대한 AI 후속 반응
- Google Search grounding 전용 표시 파이프라인 준비 상태 안내
- Gemini API 및 Vertex AI 연결 선택
- 브라우저 Local Storage를 이용한 프리셋 저장

## 요구 사항

- Node.js 20.19 이상 또는 22.12 이상
- npm
- Gemini API를 사용할 경우 Google AI Studio API 키
- Vertex AI를 사용할 경우 Vertex AI API가 활성화된 Google Cloud 프로젝트와 적절한 IAM 권한

Vite의 런타임 요구 사항 때문에 Node.js 20을 사용한다면 20.19 이상이어야 합니다.

## 설치 및 실행

```bash
npm ci
npm run dev
```

개발 서버가 출력한 로컬 주소를 브라우저에서 엽니다. 브라우저와 API 서버는 같은 origin에서 동작합니다.

Windows에서는 `run.bat`으로도 실행할 수 있습니다.

```bat
run.bat
```

기본 실행은 소스와 설정의 해시를 확인해 빌드가 없거나 오래된 경우에만 다시 빌드합니다. 개발 서버를 빌드 없이 바로 시작하려면 `run.bat --dev`, Node.js와 패키지 준비 상태만 확인하려면 `run.bat --check`, 브라우저 자동 실행을 생략하려면 `run.bat --no-browser`를 사용합니다. 서버 포트는 5173부터 사용 가능한 값을 자동 선택하며, 직접 실행할 때는 `PORT` 환경 변수로 지정할 수 있습니다.

서버는 `127.0.0.1`에만 바인딩됩니다. 이 구성은 개인 PC에서 실행하는 로컬 앱 전용이며, 서비스 계정 JSON 업로드 기능을 중앙 웹 서비스로 배포하는 용도로 지원하지 않습니다.

프로덕션 빌드와 실행은 다음과 같습니다.

```bash
npm run build
npm start
```

## AI 연결 설정

앱의 연결 설정에서 공급자를 선택합니다. 프로젝트 ID를 화면에 입력한 경우 그 값을 우선 사용하고, 입력하지 않은 경우 서버의 `GOOGLE_CLOUD_PROJECT`를 사용합니다. Vertex AI location은 `global`로 고정됩니다.

### Gemini API

Google AI Studio에서 발급받은 API 키를 앱의 연결 설정에 입력합니다. 키는 Node.js 서버가 보관하고 사용하며 브라우저 번들에는 포함되지 않습니다.

등록한 API 키와 Vertex 자격 증명은 현재 서버 프로세스의 메모리에만 남습니다. 8시간 동안 사용하지 않거나 연결을 해제하거나 서버를 재시작하면 삭제됩니다. 세션 상한에 도달하면 서버 가용성을 유지하기 위해 가장 오래 사용하지 않은 세션이 먼저 제거될 수 있습니다.

`VITE_` 접두사가 붙은 변수는 브라우저에 공개됩니다. `VITE_GEMINI_API_KEY`와 같은 변수에 비밀값을 저장하지 마세요.

### Vertex AI: Application Default Credentials

로컬 개발에서는 Application Default Credentials(ADC)를 사용할 수 있습니다. 서버 소유자의 주변 자격 증명이 의도치 않게 로컬 API에 노출되지 않도록 ADC 경로는 기본적으로 꺼져 있으며, 사용할 때만 `DCGM_ENABLE_VERTEX_ADC=1`로 명시적으로 활성화합니다.

```bash
gcloud auth application-default login
```

필요하면 서버를 시작하기 전에 프로젝트 fallback을 설정합니다.

PowerShell:

```powershell
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
$env:DCGM_ENABLE_VERTEX_ADC = "1"
npm run dev
```

macOS/Linux:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export DCGM_ENABLE_VERTEX_ADC="1"
npm run dev
```

Google Cloud에서 실행할 때는 서비스에 연결된 런타임 서비스 계정으로 ADC를 사용하는 것이 좋습니다. 장기 서비스 계정 키 파일 없이도 동일한 인증 흐름을 사용할 수 있습니다.

### Vertex AI: 서비스 계정 JSON

서비스 계정 JSON을 사용할 경우 앱의 연결 설정에서 파일을 선택하거나, ADC가 읽을 수 있도록 `GOOGLE_APPLICATION_CREDENTIALS`에 저장소 **밖**의 절대 경로를 지정합니다.

PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\<service-account-json>"
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
npm run dev
```

macOS/Linux:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/secure/<service-account-json>"
export GOOGLE_CLOUD_PROJECT="your-project-id"
npm run dev
```

JSON 파일의 `project_id`와 화면 또는 환경 변수의 프로젝트가 일치하는지 확인하세요. Vertex AI 호출 주체에는 대상 프로젝트에서 모델을 호출할 수 있는 IAM 권한이 필요합니다.

## 자격 증명 보안

- 서비스 계정 JSON, API 키, `.env` 파일을 Git에 커밋하지 마세요.
- 자격 증명 파일은 Vite가 접근할 수 있는 프로젝트 디렉터리 안에 두지 마세요. `.gitignore`는 커밋을 막을 뿐 로컬 개발 서버의 파일 노출까지 보장하지 않습니다.
- 이미 Git에 올라간 키는 파일을 삭제하는 것만으로 안전해지지 않습니다. 해당 키를 즉시 폐기하고 새 키를 발급해야 합니다.
- 클라이언트 코드, `VITE_` 환경 변수, 정적 HTML에는 비밀값을 넣지 마세요.
- 운영 환경에서는 최소 권한 서비스 계정과 플랫폼의 secret manager를 사용하세요.

## Google Search grounding 데이터

v0.1.0에서는 Google Search grounding을 사용할 수 없습니다. Google이 제공하는 grounded 결과와 검색 추천을 수정 없이 함께 표시하고, 검색 추천·출처 링크를 저장하거나 클릭 추적하지 않는 전용 파이프라인이 완성되기 전까지 릴리스에서 비활성화합니다. 향후 검색 기능을 활성화할 때 검색 기반 갤러리는 공식 표시 및 저장 조건에 따라 현재 브라우저 탭의 메모리에서만 유지하고 새로고침 복원 대상에서 제외합니다.

## 문제 해결

- `401` 또는 `403`: ADC 로그인 상태, 서비스 계정 IAM 권한, 대상 프로젝트를 확인합니다.
- 프로젝트를 찾을 수 없음: 화면의 프로젝트 ID 또는 `GOOGLE_CLOUD_PROJECT`를 확인합니다.
- 모델을 찾을 수 없음: 선택한 모델이 해당 프로젝트에서 Vertex AI로 제공되는지 확인합니다.
- 검색 기능이 비활성화됨: v0.1.0의 의도된 릴리스 정책입니다. 공식 표시·저장 조건을 충족하는 전용 파이프라인이 준비된 버전에서 활성화할 예정입니다.
- 설정을 바꾼 뒤에도 연결되지 않음: 서버를 재시작하고 앱에서 연결 테스트를 다시 실행합니다.
- 예전 버전의 갤러리·프리셋은 처음 읽을 때 V2 저장 형식으로 자동 마이그레이션됩니다. 손상된 항목은 가능한 데이터만 복구하고 화면에 경고를 표시합니다.
- 저장 데이터 문제로 화면을 계속 사용할 수 없다면 브라우저 개발자 도구의 Local Storage에서 현재 사이트의 `dcgm.session.v2`와 `dcgm.presets.v2`만 삭제한 뒤 새로고침하세요. 이 작업은 저장된 갤러리와 사용자 프리셋을 제거하지만 서버 메모리의 자격증명에는 영향을 주지 않습니다.

## 개발 구조

- `components/`, `hooks/`, `context/`: React UI와 상태 관리
- `services/`: 클라이언트 API 어댑터와 프롬프트/응답 처리
- `server/`: 자격 증명 보관 및 Gemini/Vertex AI 호출
- `utils/`, `types.ts`: 공용 유틸리티와 데이터 타입

주요 기술은 React 19, TypeScript, Vite, Node.js, `@google/genai`입니다.

## 품질 검증

로컬 변경을 제출하기 전 전체 품질 게이트를 실행합니다.

```bash
npm run verify
```

`verify`는 ESLint(React Hooks 및 JSX 접근성 포함), Prettier 형식 검사, Vitest 커버리지, 전체 TypeScript 타입 검사, 프로덕션 빌드, 번들 크기 예산, 빌드 산출물 기동 검사와 mock Playwright E2E를 순서대로 수행합니다. 브라우저를 제외한 핵심 게이트만 빠르게 확인하려면 `npm run verify:core`를, 필요하면 아래 각 단계를 따로 실행할 수 있습니다.

```bash
npm run lint
npm run format-check
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run smoke
```

브라우저 E2E는 외부 AI를 호출하지 않고 네트워크 응답을 mock 처리합니다. Playwright Chromium이 준비된 환경에서 다음 명령으로 실행합니다.

```bash
npm run test:e2e
```

릴리스 전 실제 모델 품질을 점검하려면 API 키를 명시적으로 설정한 뒤 선택형 live 평가를 실행합니다. 이 명령은 대표 5개 시나리오를 실제 호출하므로 요금과 할당량을 사용합니다. 키가 없으면 성공 상태로 건너뜁니다.

```powershell
$env:GEMINI_API_KEY = "your-api-key"
npm run eval:live
```

평가는 응답 스키마, 정확히 5개 게시물, 댓글 상한, 빈 콘텐츠, 예약된 작성자 사용 여부, 시나리오별 지연 시간/p50/p95와 SDK가 보고한 토큰 사용량을 요약합니다. 별도 평가 모델이 몰입감·관련성·다양성을 각각 5점 척도로 채점하며 평균 4.0 미만은 실패로 처리합니다. `LIVE_EVAL_MODEL`과 `LIVE_EVAL_TIMEOUT_MS`로 모델과 요청 제한 시간을 바꿀 수 있습니다.

GitHub Actions는 pull request와 `main` 브랜치 push마다 지원 Node.js 버전의 핵심 검증과 Chromium E2E를 실행합니다. Dependabot은 npm 패키지와 GitHub Actions 업데이트를 매주 확인합니다. 로컬에서는 동일한 전체 검증을 `npm run verify`로 실행할 수 있습니다. 커버리지 HTML, Playwright 보고서, 빌드 결과물은 각각 `coverage/`, `playwright-report/`, `dist/` 및 `dist-server/`에 생성되며 Git에 커밋하지 않습니다.

## 주의사항

- 생성형 AI 요청에는 공급자별 요금과 할당량이 적용될 수 있습니다.
- 높은 수위 설정에서는 거칠거나 공격적인 표현이 생성될 수 있습니다.
- 생성된 게시글과 댓글은 모두 AI가 만든 허구입니다.

## License

[MIT License](./LICENSE)
