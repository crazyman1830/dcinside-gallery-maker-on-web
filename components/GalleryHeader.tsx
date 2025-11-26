
import React from 'react';
import { GroundingSource } from '../types';

interface GalleryHeaderProps {
  galleryTitle: string;
  sources?: GroundingSource[];
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({ galleryTitle, sources }) => {
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
            <div className="hidden sm:flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs font-medium text-slate-500">LIVE</span>
            </div>
          </div>
          
          {/* Google Search Grounding Sources Display */}
          {sources && sources.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 animate-fade-in">
                <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center">
                    <i className="fab fa-google mr-1"></i>출처
                </span>
                {sources.map((source, idx) => (
                    <a 
                        key={idx} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:text-blue-600 hover:underline transition-colors flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 max-w-[200px] truncate"
                        title={source.title}
                    >
                        <i className="fas fa-link text-[10px] text-slate-400"></i>
                        {source.title || new URL(source.uri || '').hostname}
                    </a>
                ))}
            </div>
          )}
      </div>
    </div>
  );
};