# DCInside Gallery Generator

주제와 세계관 설정을 바탕으로 게시글, 댓글, 반응을 생성하는 React 애플리케이션입니다. Google AI Studio의 Gemini API와 Google Cloud Vertex AI를 모두 지원하며, AI 호출과 자격 증명 처리는 Node.js 서버에서만 수행합니다.

## 주요 기능

- 게시글과 댓글을 스트리밍으로 생성
- 세계관, 시대, 말투, 사용자 성향 등 세부 조건 설정
- 사용자 글과 댓글에 대한 AI 후속 반응
- Google Search grounding과 출처 표시
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

등록한 API 키와 Vertex 자격 증명은 현재 서버 프로세스의 메모리에만 남습니다. 8시간 동안 사용하지 않거나 연결을 해제하거나 서버를 재시작하면 삭제됩니다.

`VITE_` 접두사가 붙은 변수는 브라우저에 공개됩니다. `VITE_GEMINI_API_KEY`와 같은 변수에 비밀값을 저장하지 마세요.

### Vertex AI: Application Default Credentials

로컬 개발에서는 Application Default Credentials(ADC)를 권장합니다.

```bash
gcloud auth application-default login
```

필요하면 서버를 시작하기 전에 프로젝트 fallback을 설정합니다.

PowerShell:

```powershell
$env:GOOGLE_CLOUD_PROJECT = "your-project-id"
npm run dev
```

macOS/Linux:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
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

## 문제 해결

- `401` 또는 `403`: ADC 로그인 상태, 서비스 계정 IAM 권한, 대상 프로젝트를 확인합니다.
- 프로젝트를 찾을 수 없음: 화면의 프로젝트 ID 또는 `GOOGLE_CLOUD_PROJECT`를 확인합니다.
- 모델을 찾을 수 없음: 선택한 모델이 해당 프로젝트에서 Vertex AI로 제공되는지 확인합니다.
- 검색 기능 오류: 선택한 공급자와 모델이 Google Search grounding을 지원하는지 확인합니다.
- 설정을 바꾼 뒤에도 연결되지 않음: 서버를 재시작하고 앱에서 연결 테스트를 다시 실행합니다.

## 개발 구조

- `components/`, `hooks/`, `context/`: React UI와 상태 관리
- `services/`: 클라이언트 API 어댑터와 프롬프트/응답 처리
- `server/`: 자격 증명 보관 및 Gemini/Vertex AI 호출
- `utils/`, `types.ts`: 공용 유틸리티와 데이터 타입

주요 기술은 React 19, TypeScript, Vite, Node.js, `@google/genai`입니다.

## 주의사항

- 생성형 AI 요청에는 공급자별 요금과 할당량이 적용될 수 있습니다.
- 높은 수위 설정에서는 거칠거나 공격적인 표현이 생성될 수 있습니다.
- 생성된 게시글과 댓글은 모두 AI가 만든 허구입니다.

## License

MIT License
