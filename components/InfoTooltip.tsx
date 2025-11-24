
import React from 'react';

interface InfoTooltipProps {
  text: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle group">
      <i className="fas fa-question-circle text-slate-400 hover:text-slate-600 transition-colors cursor-help text-sm" aria-label="도움말"></i>
      <div
        role="tooltip"
        className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 pointer-events-none"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-slate-800"></div>
        {text}
      </div>
    </span>
  );
};
