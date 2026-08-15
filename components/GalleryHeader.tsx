import React from 'react';
import type { GroundingSource } from '../types';

interface GalleryHeaderProps {
  galleryTitle: string;
  worldlineId?: string;
  sources?: GroundingSource[];
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
  galleryTitle,
  worldlineId,
  sources,
}) => {
  const safeSources = (sources ?? []).flatMap(source => {
    if (!source.uri) return [];
    try {
      const url = new URL(source.uri);
      return url.protocol === 'https:' ? [{ ...source, uri: url.toString() }] : [];
    } catch {
      return [];
    }
  });

  return (
    <div className="bg-white/80 border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-sm backdrop-blur-md transition-all duration-300">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 transform transition-transform hover:scale-105">
              <i className="fas fa-comments text-lg"></i>
            </div>
            <span className="line-clamp-1 bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
              {galleryTitle}
            </span>
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {worldlineId && (
              <details className="group relative">
                <summary
                  className="cursor-help list-none rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:text-xs [&::-webkit-details-marker]:hidden"
                  aria-label={`세계선 ${worldlineId}. 이 갤러리 생성본을 구분하는 로컬 멀티버스 번호입니다. 생성본 사이의 용어 차이는 평행세계의 변형으로 볼 수 있습니다.`}
                >
                  세계선 {worldlineId}
                </summary>
                <span
                  role="note"
                  className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg bg-slate-800 p-3 text-left text-xs font-normal text-white shadow-xl"
                >
                  이 갤러리 생성본을 구분하는 로컬 멀티버스 번호입니다. 같은 설정으로 다시 생성했을
                  때 생기는 용어 차이는 평행세계의 변형으로 볼 수 있습니다.
                </span>
              </details>
            )}
            <span className="hidden h-2 w-2 rounded-full bg-green-500 animate-pulse sm:inline-block"></span>
            <span className="hidden text-xs font-medium text-slate-500 sm:inline">LIVE</span>
          </div>
        </div>

        {/* Google Search Grounding Sources Display */}
        {safeSources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 animate-fade-in">
            <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center">
              <i className="fab fa-google mr-1"></i>출처
            </span>
            {safeSources.map(source => (
              <a
                key={source.uri}
                href={source.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 hover:underline transition-colors flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 max-w-[200px] truncate"
                title={source.title}
              >
                <i className="fas fa-link text-[10px] text-slate-400"></i>
                {source.title || new URL(source.uri).hostname}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
