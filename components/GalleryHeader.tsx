
import React from 'react';

interface GalleryHeaderProps {
  galleryTitle: string;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({ galleryTitle }) => {
  return (
    <div className="bg-white/80 border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-sm backdrop-blur-md transition-all duration-300">
      <div className="flex items-center justify-between max-w-5xl mx-auto">
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
    </div>
  );
};
