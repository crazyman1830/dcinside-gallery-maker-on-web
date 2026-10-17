import React, { useMemo, useRef } from 'react';
import { timestampToEpoch } from '../utils/common';
import { Post } from '../types';
import { PostListItem } from './PostListItem';
import { useGalleryListState, type GalleryListSort } from '../hooks/useGalleryListState';
import { Icon } from './Icon';

interface PostListProps {
  galleryId?: string;
  posts: Post[];
  onSelectPost: (postId: string) => void;
  onWritePost?: () => void;
}

export const PostList: React.FC<PostListProps> = ({
  galleryId,
  posts,
  onSelectPost,
  onWritePost,
}) => {
  const { state, updateState } = useGalleryListState(galleryId);
  const { query, sort, page } = state;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const result = posts.filter(post =>
      `${post.title}\n${post.content}`.toLocaleLowerCase().includes(needle),
    );
    if (sort === 'latest')
      result.sort((a, b) => timestampToEpoch(b.timestamp) - timestampToEpoch(a.timestamp));
    if (sort === 'recommendations') result.sort((a, b) => b.recommendations - a.recommendations);
    if (sort === 'comments') result.sort((a, b) => b.comments.length - a.comments.length);
    return result;
  }, [posts, query, sort]);
  // Post numbers follow the stored order (newest first), so sorting or searching
  // never renumbers a post and only the newest post carries the NEW badge.
  const postNumbers = useMemo(
    () => new Map(posts.map((post, index) => [post.id, posts.length - index])),
    [posts],
  );
  const listTopRef = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const changePage = (nextPage: number) => {
    updateState({ page: nextPage });
    // Paging from the bottom controls should land on the first row, not mid-table.
    listTopRef.current?.scrollIntoView?.({ block: 'start' });
  };
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-16 px-4 bg-white shadow-sm rounded-2xl border border-slate-100">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon icon="fas fa-folder-open" className="text-3xl text-slate-300" />
        </div>
        <p className="text-xl font-bold text-slate-700">게시물이 없습니다</p>
        <p className="text-slate-500 mt-2 mb-6">
          아직 등록된 글이 없습니다. 첫 번째 글을 작성해보세요!
        </p>
        {onWritePost && (
          <button
            onClick={onWritePost}
            className="py-2.5 px-6 rounded-full font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 transition-all duration-200 hover:-translate-y-1"
          >
            <Icon icon="fas fa-pen" className="mr-2" /> 글쓰기
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={listTopRef}
      className="scroll-mt-24 overflow-hidden bg-white shadow-sm rounded-2xl border border-slate-200"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <label className="flex w-full min-w-0 flex-col gap-1 text-sm text-slate-700 sm:w-auto sm:flex-1">
          게시물 검색
          <input
            type="search"
            className="min-w-0 rounded-lg border border-slate-300 px-3 py-2"
            placeholder="제목 또는 본문"
            value={query}
            onChange={event => {
              updateState({ query: event.target.value, page: 1 });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          게시물 정렬
          <select
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={sort}
            onChange={event => {
              updateState({ sort: event.target.value as GalleryListSort, page: 1 });
            }}
          >
            <option value="original">기본순</option>
            <option value="latest">최신순</option>
            <option value="recommendations">추천순</option>
            <option value="comments">댓글순</option>
          </select>
        </label>
        <p role="status" className="text-sm text-slate-600">
          {filtered.length}개 게시물
        </p>
      </div>
      {filtered.length === 0 && (
        <p className="p-6 text-center text-slate-600">
          검색 결과가 없습니다. 다른 검색어를 입력해주세요.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-16 hidden sm:table-cell">
                번호
              </th>
              <th className="py-4 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                제목
              </th>
              <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-36 hidden md:table-cell">
                글쓴이
              </th>
              <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-24 hidden lg:table-cell">
                날짜
              </th>
              <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-20 hidden lg:table-cell">
                조회
              </th>
              <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-20 hidden lg:table-cell">
                추천
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map(post => (
              <PostListItem
                key={post.id}
                post={post}
                number={postNumbers.get(post.id) ?? 0}
                isNewest={postNumbers.get(post.id) === posts.length}
                onSelectPost={onSelectPost}
              />
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav
          aria-label="게시물 페이지"
          className="flex items-center justify-center gap-4 p-3 text-sm"
        >
          <button
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            이전 페이지
          </button>
          <span>
            {currentPage} / {pages}
          </span>
          <button
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50"
            disabled={currentPage === pages}
            onClick={() => changePage(currentPage + 1)}
          >
            다음 페이지
          </button>
        </nav>
      )}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
        {onWritePost && (
          <button
            onClick={onWritePost}
            className="py-2 px-5 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 text-sm"
            aria-label="새 글 작성"
          >
            <Icon icon="fas fa-pen" /> 글쓰기
          </button>
        )}
      </div>
    </div>
  );
};
