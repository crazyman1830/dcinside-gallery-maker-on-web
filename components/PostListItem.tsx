
import React from 'react';
import { Post } from '../types';

interface PostListItemProps {
  post: Post;
  index: number; 
  onSelectPost: (postId: string) => void;
}

export const PostListItem: React.FC<PostListItemProps> = React.memo(({ post, index, onSelectPost }) => {
  const displayIndex = index + 1;
  const isBest = post.isBestPost;

  return (
    <tr
      className={`border-b border-slate-100/80 transition-all duration-200 cursor-pointer group
        ${isBest ? 'bg-amber-50/60 hover:bg-amber-100/80' : 'hover:bg-slate-50'}`}
      onClick={() => onSelectPost(post.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectPost(post.id)}}
      tabIndex={0}
      role="link"
      aria-label={`게시물 ${post.title} 보기`}
    >
      {/* Number / Icon */}
      <td className="py-4 px-4 text-center text-sm font-mono w-12 sm:w-16 text-slate-400 hidden sm:table-cell">
        {isBest ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 shadow-sm ring-1 ring-amber-200/50">
             <i className="fas fa-crown text-[10px]"></i>
          </span>
        ) : displayIndex}
      </td>

      {/* Title & Mobile Meta */}
      <td className="py-3 px-4 sm:py-4">
        <div className="flex flex-col">
            <div className="flex items-start gap-2">
                {isBest && (
                   <span className="sm:hidden inline-flex mt-1 flex-shrink-0 items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-600">
                     <i className="fas fa-crown text-[10px]"></i>
                   </span>
                )}
                <span className={`text-base font-medium break-words leading-snug transition-colors
                    ${isBest ? 'text-slate-900 font-semibold' : 'text-slate-700 group-hover:text-blue-600'}`}>
                    {post.title}
                </span>
                {post.comments.length > 0 && (
                    <span className="mt-0.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md h-fit shrink-0">
                        {post.comments.length}
                    </span>
                )}
                {/* New Indicator */}
                {index === 0 && !isBest && (
                    <span className="mt-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 rounded h-fit shrink-0 uppercase tracking-tighter">NEW</span>
                )}
            </div>
            
            {/* Mobile Metadata Row */}
            <div className="sm:hidden mt-2 flex items-center text-xs text-slate-400 gap-2">
                <span className="truncate max-w-[100px] font-medium text-slate-600">{post.author}</span>
                <span className="w-[1px] h-2 bg-slate-300"></span>
                <span>{post.timestamp.split(' ')[0]}</span>
                <span className="w-[1px] h-2 bg-slate-300"></span>
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${isBest ? 'text-red-500 bg-red-50' : 'text-slate-500'}`}>
                    <i className="fas fa-thumbs-up text-[10px]"></i> {post.recommendations}
                </span>
            </div>
        </div>
      </td>

      {/* Desktop Author */}
      <td className="py-4 px-4 text-sm text-slate-600 hidden md:table-cell w-36 text-center">
          <div className="truncate w-full px-2 font-medium cursor-help" title={post.author}>{post.author}</div>
      </td>

      {/* Desktop Date */}
      <td className="py-4 px-4 text-center text-xs text-slate-400 w-24 hidden lg:table-cell whitespace-nowrap font-mono">
          {post.timestamp.split(' ')[0]}
      </td>

      {/* Desktop Views */}
      <td className="py-4 px-4 text-center text-xs text-slate-400 w-20 hidden lg:table-cell font-mono">
          {post.views.toLocaleString()}
      </td>

      {/* Desktop Recommendations */}
      <td className={`py-4 px-4 text-center text-sm w-20 hidden lg:table-cell font-semibold ${isBest ? 'text-red-600' : 'text-slate-400'}`}>
        {post.recommendations}
      </td>
    </tr>
  );
});
