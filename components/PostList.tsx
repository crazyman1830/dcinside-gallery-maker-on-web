import React from 'react';
import { Post } from '../types';
import { PostListItem } from './PostListItem';

interface PostListProps {
  posts: Post[];
  onSelectPost: (postId: string) => void;
  onWritePost?: () => void; 
}

export const PostList: React.FC<PostListProps> = ({ posts, onSelectPost, onWritePost }) => {
  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-16 px-4 bg-white shadow-sm rounded-2xl border border-slate-100">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-folder-open fa-2x text-slate-300"></i>
        </div>
        <p className="text-xl font-bold text-slate-700">게시물이 없습니다</p>
        <p className="text-slate-500 mt-2 mb-6">아직 등록된 글이 없습니다. 첫 번째 글을 작성해보세요!</p>
        {onWritePost && (
            <button
                onClick={onWritePost}
                className="py-2.5 px-6 rounded-full font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 transition-all duration-200 hover:-translate-y-1"
            >
            <i className="fas fa-pen mr-2"></i> 글쓰기
            </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white shadow-sm rounded-2xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto">
            <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
                <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-16 hidden sm:table-cell">번호</th>
                <th className="py-4 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">제목</th>
                <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-36 hidden md:table-cell">글쓴이</th>
                <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-24 hidden lg:table-cell">날짜</th>
                <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-20 hidden lg:table-cell">조회</th>
                <th className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-20 hidden lg:table-cell">추천</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
            {posts.map((post, index) => (
                <PostListItem
                key={post.id}
                post={post}
                index={index}
                onSelectPost={onSelectPost}
                />
            ))}
            </tbody>
        </table>
      </div>
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
        {onWritePost && (
            <button
                onClick={onWritePost}
                className="py-2 px-5 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 text-sm"
                aria-label="새 글 작성"
            >
            <i className="fas fa-pen"></i> 글쓰기
            </button>
        )}
      </div>
    </div>
  );
};