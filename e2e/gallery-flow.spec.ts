import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const browserErrorsByPage = new WeakMap<Page, string[]>();
const allowedBrowserErrorsByPage = new WeakMap<Page, RegExp[]>();

const allowBrowserErrors = (page: Page, ...patterns: RegExp[]) => {
  allowedBrowserErrorsByPage.set(page, patterns);
};

const isoTimestamp = '2026-08-14T06:00:00.000Z';
const mockGallery = {
  galleryTitle: '품질 테스트 갤러리',
  posts: [
    {
      id: 'post-1',
      title: '첫 번째 테스트 글',
      author: '테스터',
      timestamp: isoTimestamp,
      content: '외부 AI 호출 없이 제공된 mock 게시물입니다.',
      views: 42,
      recommendations: 7,
      nonRecommendations: 1,
      comments: [],
    },
  ],
};

const followUpComment = {
  id: 'comment-ai-1',
  author: 'AI댓글러',
  text: 'mock AI 후속 댓글입니다.',
  timestamp: '2026-08-14T06:01:00.000Z',
  recommendations: 1,
  nonRecommendations: 0,
};

const expectNoSeriousA11yViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    results.violations.filter(
      violation => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
};

const mockCredentials = async (page: Page) => {
  await page.route('**/api/ai/credentials', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: {
          gemini: { configured: true },
          vertex: { configured: false },
        },
        capabilities: { vertexAdc: false },
      }),
    });
  });
};

const mockGeneration = async (page: Page) => {
  await page.route('**/api/ai/gallery/stream', async route => {
    const body = [
      JSON.stringify({ type: 'phase', phase: 'posts', message: 'mock 생성 중', progress: 70 }),
      JSON.stringify({ type: 'chunk', text: '{"galleryTitle":"품질 테스트 갤러리"}' }),
      JSON.stringify({ type: 'result', data: mockGallery }),
      '',
    ].join('\n');
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson; charset=utf-8',
      body,
    });
  });
};

const submitMockGallery = async (page: Page) => {
  await page.getByLabel(/갤러리 주제/).fill('품질 테스트');
  await page.getByRole('button', { name: '갤러리 생성', exact: true }).click();
  await expect(page.getByRole('heading', { name: '품질 테스트 갤러리' })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  const browserErrors: string[] = [];
  browserErrorsByPage.set(page, browserErrors);
  page.on('pageerror', error => {
    browserErrors.push(`Page error: ${error.stack ?? error.message}`);
  });
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`Console error: ${message.text()}`);
  });
  await mockCredentials(page);
  await mockGeneration(page);
});

test.afterEach(async ({ page }) => {
  const allowedPatterns = allowedBrowserErrorsByPage.get(page) ?? [];
  const unexpectedErrors = (browserErrorsByPage.get(page) ?? []).filter(
    message => !allowedPatterns.some(pattern => pattern.test(message)),
  );

  expect(unexpectedErrors, 'Unexpected browser errors were emitted during the test.').toEqual([]);
});

test('keyboard desktop flow persists voting and comments across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/api/ai/comments/follow-up', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([followUpComment]),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /DCInside 갤러리 생성기/ })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await submitMockGallery(page);

  const postButton = page.getByRole('button', { name: '게시물 첫 번째 테스트 글 보기' });
  const postRow = page.getByRole('row').filter({ has: postButton });
  await expect(postRow).not.toHaveAttribute('role', 'link');
  expect(await postRow.getAttribute('tabindex')).toBeNull();
  await postButton.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('외부 AI 호출 없이 제공된 mock 게시물입니다.')).toBeVisible();
  const recommend = page.getByRole('button', { name: '추천 7개' });
  const nonRecommend = page.getByRole('button', { name: '비추천 1개' });
  await expect(recommend).toHaveAttribute('aria-pressed', 'false');
  await expect(nonRecommend).toHaveAttribute('aria-pressed', 'false');
  await recommend.focus();
  await page.keyboard.press('Enter');
  const selectedRecommend = page.getByRole('button', { name: '추천 8개' });
  await expect(selectedRecommend).toHaveAttribute('aria-pressed', 'true');
  await expect(nonRecommend).toHaveAttribute('aria-pressed', 'false');

  await page.getByLabel('댓글 내용').fill('사용자가 남긴 댓글입니다.');
  await page.getByRole('button', { name: '등록', exact: true }).focus();
  await page.keyboard.press('Enter');
  const userComment = page.getByLabel(/의 댓글/).filter({ hasText: '사용자가 남긴 댓글입니다.' });
  await expect(userComment).toBeVisible();
  await expect(page.getByText(followUpComment.text)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '품질 테스트 갤러리' })).toBeVisible();
  await page.getByRole('button', { name: '게시물 첫 번째 테스트 글 보기' }).click();
  await expect(page.getByRole('button', { name: '추천 8개' })).toBeVisible();
  await expect(
    page.getByLabel(/의 댓글/).filter({ hasText: '사용자가 남긴 댓글입니다.' }),
  ).toBeVisible();
  await expect(page.getByText(followUpComment.text)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('keeps the user comment when the mocked AI follow-up fails', async ({ page }) => {
  allowBrowserErrors(page, /502 \(Bad Gateway\)/u, /mock provider failure/u);
  await page.route('**/api/ai/comments/follow-up', async route => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'mock provider failure' }),
    });
  });

  await page.goto('/');
  await submitMockGallery(page);
  await page.getByRole('button', { name: '게시물 첫 번째 테스트 글 보기' }).click();
  await page.getByLabel('댓글 내용').fill('부분 실패에도 남아야 하는 댓글');
  await page.getByRole('button', { name: '등록', exact: true }).click();

  await expect(page.getByText('부분 실패에도 남아야 하는 댓글')).toBeVisible();
  await expect(page.getByText('댓글은 등록되었지만 AI 응답 생성에 실패했습니다.')).toBeVisible();
});

test('cancels an in-flight generation and keeps the setup usable', async ({ page }) => {
  await page.unroute('**/api/ai/gallery/stream');
  let releaseRequest: () => void = () => undefined;
  const requestBlocked = new Promise<void>(resolve => {
    releaseRequest = resolve;
  });
  await page.route('**/api/ai/gallery/stream', async route => {
    await requestBlocked;
    await route.abort('aborted').catch(() => undefined);
  });

  await page.goto('/');
  await page.getByLabel(/갤러리 주제/).fill('취소 테스트');
  await page.getByRole('button', { name: '갤러리 생성', exact: true }).click();

  const cancelButton = page.getByRole('button', { name: '생성 취소' });
  await expect(cancelButton).toBeVisible();
  await cancelButton.focus();
  await page.keyboard.press('Enter');
  releaseRequest();

  await expect(
    page.getByText('갤러리 생성을 취소했습니다. 기존 갤러리는 그대로 보존됩니다.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '갤러리 생성', exact: true })).toBeEnabled();
});

test('mobile setup remains usable and has no serious accessibility violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /DCInside 갤러리 생성기/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '주제와 현재 떡밥' })).toBeVisible();
  await page.getByRole('button', { name: '고급 설정' }).click();
  await expect(page.getByRole('checkbox', { name: /실시간 웹 검색 반영/ })).toBeDisabled();
  await expect(
    page.getByText('공식 표시·저장 조건을 충족하는 전용 흐름을 준비 중입니다.'),
  ).toBeVisible();
  await page.getByRole('button', { name: '내 프로필 설정' }).click();
  const anonymous = page.getByRole('button', { name: /유동닉/ });
  const fixed = page.getByRole('button', { name: /고정닉/ });
  await expect(anonymous).toHaveAttribute('aria-pressed', 'true');
  await expect(fixed).toHaveAttribute('aria-pressed', 'false');
  await fixed.click();
  await expect(anonymous).toHaveAttribute('aria-pressed', 'false');
  await expect(fixed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('slider', { name: '갤러리 내 인지도/호감도' })).toHaveAttribute(
    'aria-valuetext',
    /50점/,
  );
  await expect(page.getByLabel('닉네임 입력')).toHaveAttribute('aria-required', 'true');
  await page.getByRole('button', { name: '내 프로필 설정' }).click();
  await expectNoSeriousA11yViolations(page);
});
