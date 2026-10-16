// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryLibrary } from '../components/GalleryLibrary';
import {
  listLibraryEntries,
  writeLibraryEntry,
  type LibraryEntry,
} from '../services/galleryLibrary';
import type { GallerySessionV2 } from '../types';

vi.mock('../services/galleryLibrary', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/galleryLibrary')>()),
  listLibraryEntries: vi.fn(),
  writeLibraryEntry: vi.fn(),
}));

const session: GallerySessionV2 = {
  version: 2,
  revision: 1,
  savedAt: '2026-10-03T00:00:00.000Z',
  context: {
    worldlineId: 'WL-1111-2222-3333',
    topic: '테스트',
    discussionContext: '',
    worldviewValue: 'NONE',
    customWorldviewText: '',
    worldviewEraValue: 'CONTEMPORARY',
    toxicityLevelValue: 'MEDIUM',
    anonymousNickRatioValue: 'BALANCED',
    userSpecies: '',
    userAffiliation: '',
    genderRatioValue: 'AUTO',
    ageRangeValue: 'AUTO',
    selectedProvider: 'gemini',
    selectedModel: 'gemini-3.5-flash',
    useSearch: false,
  },
  profile: null,
  gallery: { galleryTitle: '원본 갤러리', posts: [] },
};
let saved: LibraryEntry;
const changedSession = (title: string): GallerySessionV2 => ({
  ...session,
  gallery: { ...session.gallery, galleryTitle: title },
});

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  saved = {
    id: session.context.worldlineId,
    name: '보관 항목',
    revision: 1,
    session: structuredClone(session),
  };
  vi.mocked(listLibraryEntries).mockImplementation(async () => [structuredClone(saved)]);
  vi.mocked(writeLibraryEntry).mockImplementation(async (value, expected, name) => {
    if (expected !== saved.revision) throw new Error('다른 탭에서 변경되어 저장하지 않았습니다.');
    saved = {
      ...saved,
      revision: saved.revision + 1,
      session: structuredClone(value),
      name: name ?? saved.name,
    };
    return structuredClone(saved);
  });
});
afterEach(cleanup);

const mount = async (value = session) => {
  const ref = createRef<{ saveCurrent: () => Promise<boolean> }>();
  const onOpen = vi.fn();
  const view = render(
    <GalleryLibrary ref={ref} session={value} disabled={false} onOpen={onOpen} />,
  );
  fireEvent.click(screen.getByText(/^갤러리 보관함/));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '현재 갤러리 보관' })).toBeEnabled(),
  );
  return { ...view, ref, onOpen };
};

describe('gallery library snapshot conflicts', () => {
  it('keeps the opened base revision after refreshing another tab’s newer snapshot', async () => {
    const view = await mount();
    const local = changedSession('이 탭의 미보관 변경');
    view.rerender(
      <GalleryLibrary ref={view.ref} session={local} disabled={false} onOpen={view.onOpen} />,
    );
    saved = { ...saved, revision: 2, session: changedSession('다른 탭의 최신 내용') };
    fireEvent.click(screen.getByRole('button', { name: '보관함 새로고침' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '현재 갤러리 보관' })).toBeEnabled(),
    );
    let success: boolean | undefined;
    await act(async () => {
      success = await view.ref.current?.saveCurrent();
    });
    expect(success).toBe(false);
    expect(writeLibraryEntry).toHaveBeenLastCalledWith(local, 1, '보관 항목');
    expect(saved.session.gallery.galleryTitle).toBe('다른 탭의 최신 내용');
    expect(screen.getByRole('status')).toHaveTextContent('다른 탭');
    // A second refresh must not grant overwrite permission either.
    fireEvent.click(screen.getByRole('button', { name: '보관함 새로고침' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '현재 갤러리 보관' })).toBeEnabled(),
    );
    await act(async () => {
      success = await view.ref.current?.saveCurrent();
    });
    expect(success).toBe(false);
    expect(writeLibraryEntry).toHaveBeenLastCalledWith(local, 1, '보관 항목');
  });

  it('preserves lineage across remounts with unarchived edits and advances it only after a successful save', async () => {
    const first = await mount();
    first.unmount();
    const local = changedSession('새로고침 후에도 유지할 변경');
    const restored = await mount(local);
    let success: boolean | undefined;
    await act(async () => {
      success = await restored.ref.current?.saveCurrent();
    });
    expect(success).toBe(true);
    expect(writeLibraryEntry).toHaveBeenLastCalledWith(local, 1, '보관 항목');
    await act(async () => {
      success = await restored.ref.current?.saveCurrent();
    });
    expect(success).toBe(true);
    expect(writeLibraryEntry).toHaveBeenLastCalledWith(local, 2, '보관 항목');
    expect(saved.revision).toBe(3);
  });

  it('requires explicit confirmation to discard current edits and adopts the snapshot only on opening it', async () => {
    const view = await mount();
    saved = { ...saved, revision: 2, session: changedSession('최신 저장본') };
    fireEvent.click(screen.getByRole('button', { name: '보관함 새로고침' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '저장본으로 되돌리기' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '저장본으로 되돌리기' }));
    expect(view.onOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/보관하지 않은 변경 내용이 사라집니다/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '저장본 열기' }));
    await waitFor(() => expect(view.onOpen).toHaveBeenCalledWith(saved.session));
    view.rerender(
      <GalleryLibrary
        ref={view.ref}
        session={saved.session}
        disabled={false}
        onOpen={view.onOpen}
      />,
    );
    await act(async () => {
      await view.ref.current?.saveCurrent();
    });
    expect(writeLibraryEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ gallery: { galleryTitle: '최신 저장본', posts: [] } }),
      2,
      '보관 항목',
    );
  });

  it('does not adopt an unknown existing revision merely because the library loads successfully', async () => {
    const local = changedSession('출처를 알 수 없는 예전 내용');
    const view = await mount(local);
    let success: boolean | undefined;
    await act(async () => {
      success = await view.ref.current?.saveCurrent();
    });
    expect(success).toBe(false);
    expect(writeLibraryEntry).toHaveBeenLastCalledWith(local, null, '보관 항목');
    expect(saved.session.gallery.galleryTitle).toBe('원본 갤러리');
  });
});
