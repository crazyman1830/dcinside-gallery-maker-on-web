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
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `post-${index + 2}`,
      title: `추가 테스트 글 ${index + 2}`,
      author: `테스터${index + 2}`,
      timestamp: isoTimestamp,
      content: `정확히 다섯 개 계약을 위한 mock 게시물 ${index + 2}입니다.`,
      views: 20 + index,
      recommendations: 2,
      nonRecommendations: 0,
      comments: [],
    })),
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
  await expect(page.getByText(/^세계선 WL-[0-9A-F-]+$/)).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  // A missing mock must fail locally; never fall through to a real provider.
  await page.route('**/api/ai/**', route =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unmocked AI API request' }),
    }),
  );
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

  await expect(page.getByText('부분 실패에도 남아야 하는 댓글', { exact: true })).toBeVisible();
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
  const fixed = page.getByRole('button', { name: /^고정닉 \(닉네임\)/ });
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

test('restores settings across navigation and reload, and supports browser history', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(/갤러리 주제/).fill('마법 도시');
  await page.locator('#worldview').selectOption('CUSTOM');
  await page.locator('#customWorldviewText').fill('마법 길드가 운영하는 도시');
  await page.locator('#worldviewEra').selectOption('MEDIEVAL');
  await page.getByRole('button', { name: '내 프로필 설정' }).click();
  await page.getByRole('button', { name: /^고정닉 \(닉네임\)/ }).click();
  await page.getByLabel('닉네임 입력').fill('루나');
  await page.getByRole('button', { name: '고급 설정' }).click();
  const selectedModel = await page.locator('#modelSelect').inputValue();
  await page.getByRole('button', { name: '갤러리 생성', exact: true }).click();
  await expect(page).toHaveURL(/#gallery$/);
  await page.getByRole('button', { name: '게시물 첫 번째 테스트 글 보기' }).click();
  await expect(page).toHaveURL(/#post\/post-1$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: '게시물 목록', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByText('외부 AI 호출 없이 제공된 mock 게시물입니다.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('외부 AI 호출 없이 제공된 mock 게시물입니다.')).toBeVisible();
  await page.getByRole('button', { name: '현재 설정으로 새 갤러리 만들기' }).click();
  await expect(page.getByLabel(/갤러리 주제/)).toHaveValue('마법 도시');
  await expect(page.locator('#customWorldviewText')).toHaveValue('마법 길드가 운영하는 도시');
  await expect(page.locator('#worldviewEra')).toHaveValue('MEDIEVAL');
  await page.getByRole('button', { name: '내 프로필 설정' }).click();
  await expect(page.getByLabel('닉네임 입력')).toHaveValue('루나');
  await page.getByRole('button', { name: '고급 설정' }).click();
  await expect(page.locator('#modelSelect')).toHaveValue(selectedModel);
  await page.getByLabel(/갤러리 주제/).fill('편집 중 초안');
  await page.getByRole('button', { name: '기존 갤러리로 돌아가기' }).click();
  await page.getByRole('button', { name: '현재 설정으로 새 갤러리 만들기' }).click();
  await expect(page.getByLabel(/갤러리 주제/)).toHaveValue('편집 중 초안');
  await page.getByRole('button', { name: '설정 초기화', exact: true }).click();
  await expect(page.getByLabel(/갤러리 주제/)).toHaveValue('');
  await page.goto('/#post/unknown');
  await expect(page).toHaveURL(/#gallery$/);
});

test('archives the previous gallery automatically and round trips a backup without overwriting duplicates', async ({
  page,
}) => {
  await page.goto('/');
  await submitMockGallery(page);
  const firstWorldline = await page.getByText(/^세계선 WL-/).textContent();
  await page.getByRole('button', { name: '현재 설정으로 새 갤러리 만들기' }).click();
  await page.getByLabel(/갤러리 주제/).fill('두 번째 세계선');
  await page.getByRole('button', { name: '갤러리 생성', exact: true }).click();
  await expect(page).toHaveURL(/#gallery$/);
  await expect(page.getByText(/^세계선 WL-/)).not.toHaveText(firstWorldline!);
  await page.getByText(/^갤러리 보관함/).click();
  const entry = page
    .getByRole('listitem')
    .filter({ hasText: firstWorldline!.replace('세계선 ', '') });
  await expect(entry).toBeVisible();
  await entry.getByRole('button', { name: '이름 변경' }).click();
  await entry.getByLabel('보관함 이름').fill('첫 번째 세계');
  await entry.getByRole('button', { name: '이름 저장' }).click();
  await expect(entry.getByText('첫 번째 세계', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await entry.getByRole('button', { name: '내보내기', exact: true }).click();
  const backup = await downloadPromise;
  const path = await backup.path();
  expect(path).not.toBeNull();
  await page.getByLabel('백업 가져오기').setInputFiles(path!);
  await expect(page.getByText(/같은 세계선이 이미 있습니다/)).toBeVisible();
  await entry.getByRole('button', { name: '삭제', exact: true }).click();
  await entry.getByRole('button', { name: '삭제 확인' }).click();
  await expect(entry).toHaveCount(0);
  await page.getByLabel('백업 가져오기').setInputFiles(path!);
  await expect(page.getByText('백업을 보관함에 추가했습니다.')).toBeVisible();
  await entry.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.getByText(/^세계선 WL-/)).toHaveText(firstWorldline!);
  await page.getByRole('button', { name: '현재 설정으로 새 갤러리 만들기' }).click();
  await expect(page.getByLabel(/갤러리 주제/)).toHaveValue('품질 테스트');
});

test('retries only the failed AI reaction and preserves the original user comment', async ({
  page,
}) => {
  allowBrowserErrors(page, /502 \(Bad Gateway\)/u, /mock provider failure/u);
  let calls = 0;
  await page.route('**/api/ai/comments/follow-up', async route => {
    calls += 1;
    await route.fulfill({
      status: calls === 1 ? 502 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        calls === 1 ? { error: 'mock provider failure', retryable: true } : [followUpComment],
      ),
    });
  });
  await page.goto('/');
  await submitMockGallery(page);
  await page.getByRole('button', { name: '게시물 첫 번째 테스트 글 보기' }).click();
  await page.getByLabel('댓글 내용').fill('재시도할 댓글');
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await page.getByRole('button', { name: 'AI 반응 다시 생성' }).click();
  await expect(page.getByText(followUpComment.text)).toBeVisible();
  await expect(page.getByText('재시도할 댓글', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'AI 반응 다시 생성' })).toHaveCount(0);
  expect(calls).toBe(2);
});

test('continues a worldline with new posts, retains previous votes and uses saved memory', async ({
  page,
}) => {
  await page.goto('/');
  await submitMockGallery(page);
  const worldline = await page.getByText(/^세계선 WL-/).textContent();
  await page.getByText('세계관 기억과 이어서 생성', { exact: true }).click();
  await page.getByLabel('세계관 메모').fill('길드장은 루나');
  await page.getByRole('button', { name: '메모 저장', exact: true }).click();
  // Saving notes keeps the editor and any event draft open.
  await page.route('**/api/ai/gallery/stream', async route => {
    const payload = route.request().postDataJSON();
    expect(payload.continuityNotes).toBe('길드장은 루나');
    expect(payload.continuationContext).toEqual({
      galleryTitle: mockGallery.galleryTitle,
      totalPostCount: mockGallery.posts.length,
      recentPosts: mockGallery.posts.map(post => ({
        title: post.title,
        author: post.author,
        contentExcerpt: post.content.slice(0, 300),
      })),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify({ type: 'result', data: { ...mockGallery, posts: mockGallery.posts.map(post => ({ ...post, id: `continued-${post.id}`, title: `후속 ${post.title}` })) } })}\n`,
    });
  });
  await page.getByRole('button', { name: '이 세계관에서 새 글 5개 추가' }).click();
  await expect(page.getByText('10개 게시물', { exact: true })).toBeVisible();
  await expect(page.getByText(/^세계선 WL-/)).toHaveText(worldline!);
  await page.getByLabel('게시물 검색').fill('후속');
  await expect(page.getByText('5개 게시물', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('게시물 검색')).toHaveValue('후속');
  await expect(page.getByText('5개 게시물', { exact: true })).toBeVisible();
  await page.getByLabel('게시물 검색').fill('');
  await expect(page.getByText('10개 게시물', { exact: true })).toBeVisible();
  await page.getByText('세계관 기억과 이어서 생성', { exact: true }).click();
  await expect(page.getByLabel('세계관 메모')).toHaveValue('길드장은 루나');
});
