# DCInside Gallery Generator (DCInside 갤러리 생성기)

**DCInside Gallery Generator**는 Google Gemini API를 활용하여 사용자가 입력한 주제와 설정에 맞춰 실제 디시인사이드 갤러리와 유사한 커뮤니티 환경을 시뮬레이션해주는 웹 애플리케이션입니다.

단순한 텍스트 생성을 넘어, 갤러리의 분위기, 유저들의 말투(고정닉/유동닉), 추천/비추천 역학 관계 등을 리얼하게 재현하여 몰입감 있는 경험을 제공합니다.

## ✨ 주요 기능

*   **AI 기반 갤러리 시뮬레이션**: 주제를 입력하면 해당 주제에 맞는 게시글 목록, 작성자, 조회수, 추천수를 실시간으로 생성합니다.
*   **강력한 세계관 커스터마이징**:
    *   **프리셋**: 무협, 판타지, 선사시대, 근미래 등 다양한 기본 설정 제공
    *   **커스텀 세계관**: 사용자가 직접 설정한 세계관(예: "마법이 존재하는 사이버펑크 조선") 반영
*   **디테일한 분위기 설정**:
    *   **매운맛 조절**: 순한맛(클린봇)부터 매운맛(거친 표현)까지 수위 조절
    *   **유저 성향**: 고정닉/유동닉 비율, 성비, 연령대, 종족/소속 설정
*   **인터랙티브 기능**:
    *   **게시글 열람 및 반응**: AI가 생성한 게시글을 읽고 추천/비추천 투표
    *   **댓글 시스템**: AI가 작성한 댓글 및 대댓글 확인 (티키타카 구현)
    *   **사용자 참여**: 사용자가 직접 글이나 댓글을 작성하면 AI가 그에 맞춰 반응
*   **고급 기능**:
    *   Google Search Grounding을 통한 실시간 정보 반영 (최신 뉴스/트렌드)
    *   스트리밍 응답을 통한 빠른 로딩 경험
    *   설정 프리셋 저장/불러오기 (Local Storage)

## 🛠️ 기술 스택

*   **Frontend**: React 19, TypeScript
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS
*   **AI Model**: Google Gemini API (`gemini-2.5-flash`, `gemini-2.5-pro` 등)
    *   SDK: `@google/genai`

## 🚀 설치 및 실행 방법

이 프로젝트는 Vite를 기반으로 합니다.

### 1. 사전 요구사항
*   Node.js (v18 이상 권장)
*   Google Gemini API Key

### 2. 설치

```bash
# 의존성 설치
npm install
```

### 3. 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하거나 환경 변수를 설정해야 합니다. (WebContainer 환경에서는 자동으로 주입될 수 있습니다.)

```env
VITE_GEMINI_API_KEY=your_google_api_key_here
```

### 4. 실행

```bash
# 개발 서버 실행
npm run dev
```

## 📂 프로젝트 구조

*   `src/components`: UI 컴포넌트 (갤러리 폼, 게시글 목록, 뷰어, 댓글창 등)
*   `src/services`: AI 로직 및 프롬프트 엔지니어링
    *   `geminiService.ts`: Gemini API 호출 및 응답 파싱
    *   `prompts/`: 상황별(세계관, 댓글, 평가 등) 프롬프트 모듈
*   `src/hooks`: React Custom Hooks (`useGallery`, `useGalleryForm` 등)
*   `src/types`: 데이터 인터페이스 정의 (Post, Comment, GalleryData)

## ⚠️ 주의사항

*   이 프로젝트는 생성형 AI를 사용하므로, **API Key**가 필수적으로 요구됩니다.
*   '매운맛' 설정 시 AI가 생성하는 콘텐츠에 다소 거칠거나 공격적인 표현이 포함될 수 있습니다.
*   생성된 모든 콘텐츠는 AI에 의해 만들어진 허구입니다.

## License

MIT License
