// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostList } from '../components/PostList';
import { useGalleryNavigation } from '../hooks/useGalleryNavigation';
import {
  getGalleryListScrollPosition,
  rememberGalleryListScrollPosition,
  useGalleryListState,
} from '../hooks/useGalleryListState';
import type { GalleryData } from '../types';

const gallery: GalleryData = {
  galleryTitle: '마법 갤러리',
  posts: Array.from({ length: 45 }, (_, index) => ({
    id: `post-${index}`,
    title: `주문 ${index}`,
    content: '마법 이야기',
    author: '마법사',
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    views: 100,
    recommendations: index,
    nonRecommendations: 0,
    comments: [],
  })),
};

const Gallery = ({ galleryId, loading = false }: { galleryId: string; loading?: boolean }) => {
  const navigation = useGalleryNavigation(gallery, galleryId, loading);
  if (loading) return <p>생성 중</p>;
  return navigation.view === 'post' ? (
    <>
      <h2 id="post-title" tabIndex={-1}>
        {navigation.post?.title}
      </h2>
      <button onClick={() => navigation.navigate('gallery-list')}>목록으로</button>
    </>
  ) : (
    <>
      <h2 id="gallery-content-title" tabIndex={-1}>
        게시물 목록
      </h2>
      <PostList
        galleryId={galleryId}
        posts={gallery.posts}
        onSelectPost={id => navigation.navigate('post', id)}
      />
    </>
  );
};

const scrollTo = (top: number) => {
  window.scrollY = top;
  fireEvent.scroll(window);
};

beforeEach(() => {
  window.history.replaceState(null, '', '#gallery');
  sessionStorage.clear();
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  window.history.scrollRestoration = 'auto';
  vi.spyOn(window, 'scrollTo').mockImplementation((options?: number | ScrollToOptions) => {
    if (typeof options === 'object') window.scrollY = options.top ?? 0;
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('gallery list navigation state', () => {
  it('restores query, order, page and scroll after reading a post and choosing the list button', () => {
    render(<Gallery galleryId="list-button" />);
    fireEvent.change(screen.getByLabelText('게시물 검색'), { target: { value: '주문' } });
    fireEvent.change(screen.getByLabelText('게시물 정렬'), {
      target: { value: 'recommendations' },
    });
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /게시물 .* 보기/ })[0]).toHaveTextContent(
      '주문 24',
    );
    scrollTo(780);
    fireEvent.click(screen.getByRole('button', { name: '게시물 주문 24 보기' }));
    expect(window.scrollY).toBe(0);
    scrollTo(240);
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    expect(screen.getByLabelText('게시물 검색')).toHaveValue('주문');
    expect(screen.getByLabelText('게시물 정렬')).toHaveValue('recommendations');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(window.scrollY).toBe(780);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '게시물 목록' }));
    fireEvent.change(screen.getByLabelText('게시물 검색'), { target: { value: '주문 1' } });
    expect(screen.queryByText('2 / 3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '게시물 주문 19 보기' })).toBeInTheDocument();
  });

  it('restores the same list after browser back and prevents native scroll restoration conflicts', async () => {
    const result = render(<Gallery galleryId="browser-back" />);
    fireEvent.change(screen.getByLabelText('게시물 정렬'), { target: { value: 'latest' } });
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    scrollTo(510);
    fireEvent.click(screen.getByRole('button', { name: '게시물 주문 24 보기' }));
    expect(window.history.scrollRestoration).toBe('manual');
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument());
    expect(screen.getByLabelText('게시물 정렬')).toHaveValue('latest');
    expect(window.scrollY).toBe(510);
    result.unmount();
    expect(window.history.scrollRestoration).toBe('auto');
  });

  it('keeps separate state for each gallery and starts a new gallery at the top', () => {
    const result = render(<Gallery galleryId="first-gallery" />);
    fireEvent.change(screen.getByLabelText('게시물 검색'), { target: { value: '주문 2' } });
    scrollTo(390);
    result.rerender(<Gallery galleryId="second-gallery" />);
    expect(screen.getByLabelText('게시물 검색')).toHaveValue('');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(window.scrollY).toBe(0);
    result.rerender(<Gallery galleryId="first-gallery" />);
    expect(screen.getByLabelText('게시물 검색')).toHaveValue('주문 2');
    expect(window.scrollY).toBe(390);
  });

  it('does not overwrite the reading position with generation progress scrolling', () => {
    const result = render(<Gallery galleryId="continuation-gallery" />);
    scrollTo(640);
    result.rerender(<Gallery galleryId="continuation-gallery" loading />);
    scrollTo(110);
    result.rerender(<Gallery galleryId="continuation-gallery" />);
    expect(window.scrollY).toBe(640);
  });

  it('ignores a delayed navigation back to an unchanged list during generation', () => {
    const hook = renderHook(
      ({ loading }) => useGalleryNavigation(gallery, 'delayed-navigation', loading),
      {
        initialProps: { loading: false },
      },
    );
    scrollTo(550);
    const navigateBeforeLoading = hook.result.current.navigate;
    hook.rerender({ loading: true });
    scrollTo(90);
    act(() => navigateBeforeLoading('gallery-list'));
    hook.rerender({ loading: false });
    expect(window.scrollY).toBe(550);
  });
  it('reads persisted list controls and focuses without scrolling to the heading', () => {
    sessionStorage.setItem(
      'gallery-list-state:persisted-gallery',
      JSON.stringify({ query: '주문', sort: 'latest', page: 2, scrollTop: 450 }),
    );
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<Gallery galleryId="persisted-gallery" />);
    expect(screen.getByLabelText('게시물 검색')).toHaveValue('주문');
    expect(screen.getByLabelText('게시물 정렬')).toHaveValue('latest');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(window.scrollY).toBe(450);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('recovers from corrupt and invalid saved state', () => {
    sessionStorage.setItem('gallery-list-state:corrupt-gallery', '{bad json');
    const hook = renderHook(({ id }) => useGalleryListState(id), {
      initialProps: { id: 'corrupt-gallery' },
    });
    expect(hook.result.current.state).toEqual({ query: '', sort: 'original', page: 1 });
    sessionStorage.setItem(
      'gallery-list-state:invalid-gallery',
      JSON.stringify({ query: 45, sort: 'invalid', page: -4, scrollTop: -20 }),
    );
    hook.rerender({ id: 'invalid-gallery' });
    expect(hook.result.current.state).toEqual({ query: '', sort: 'original', page: 1 });
    expect(getGalleryListScrollPosition('invalid-gallery')).toBe(0);
    rememberGalleryListScrollPosition('invalid-gallery', Number.NaN);
    expect(getGalleryListScrollPosition('invalid-gallery')).toBe(0);
  });

  it('keeps controls and scroll in memory if reading and writing storage fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const first = render(<Gallery galleryId="blocked-storage" />);
    fireEvent.change(screen.getByLabelText('게시물 검색'), { target: { value: '주문' } });
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    scrollTo(280);
    first.unmount();
    render(<Gallery galleryId="blocked-storage" />);
    expect(screen.getByLabelText('게시물 검색')).toHaveValue('주문');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(window.scrollY).toBe(280);
  });
});
