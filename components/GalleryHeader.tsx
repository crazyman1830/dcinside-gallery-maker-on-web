import React from 'react';
import type { GroundingSource } from '../types';
import { Icon } from './Icon';

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
    <div className="sticky top-0 z-20 rounded-t-2xl border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-blue-500/20"
          aria-hidden="true"
        >
          <Icon icon="fas fa-comments" className="text-lg" />
        </span>
        <h2 className="min-w-[12rem] flex-1 break-words text-xl font-bold leading-tight tracking-tight text-slate-800 md:text-2xl">
          {galleryTitle}
        </h2>
        {worldlineId && (
          <details className="group relative shrink-0">
            <summary
              className="cursor-help list-none rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:text-xs [&::-webkit-details-marker]:hidden"
              aria-label={`세계선 ${worldlineId}. 이 갤러리 생성본을 구분하는 로컬 멀티버스 번호입니다. 생성본 사이의 용어 차이는 평행세계의 변형으로 볼 수 있습니다.`}
            >
              세계선 {worldlineId}
            </summary>
            <span
              role="note"
              className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-slate-800 p-3 text-left text-xs font-normal text-white shadow-xl"
            >
              이 갤러리 생성본을 구분하는 로컬 멀티버스 번호입니다. 같은 설정으로 다시 생성했을 때
              생기는 용어 차이는 평행세계의 변형으로 볼 수 있습니다.
            </span>
          </details>
        )}
      </div>

      {/* Google Search Grounding Sources Display */}
      {safeSources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 animate-fade-in">
          <span className="flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-0.5 font-semibold text-blue-600">
            <Icon icon="fab fa-google" className="mr-1" />
            출처
          </span>
          {safeSources.map(source => (
            <a
              key={source.uri}
              href={source.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-[200px] items-center gap-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-0.5 transition-colors hover:text-blue-600 hover:underline"
              title={source.title}
            >
              <Icon icon="fas fa-link" className="text-[10px] text-slate-400" />
              {source.title || new URL(source.uri).hostname}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
