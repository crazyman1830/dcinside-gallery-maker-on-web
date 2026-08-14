import React from 'react';

interface FormSectionProps {
  title: string;
  iconClass: string;
  iconColorClass?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  id: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  iconClass,
  iconColorClass = 'text-slate-500',
  isOpen,
  onToggle,
  children,
  id,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-md">
      <button
        id={`${id}-toggle`}
        type="button"
        onClick={onToggle}
        className={`w-full flex justify-between items-center p-5 text-left focus:outline-none transition-colors duration-200 ${isOpen ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
      >
        <span className="flex items-center text-lg font-bold text-slate-700">
          <span
            className={`mr-3 flex h-8 w-8 items-center justify-center rounded-lg ${isOpen ? 'bg-white shadow-sm' : 'bg-slate-100'}`}
          >
            <i className={`${iconClass} ${iconColorClass}`} aria-hidden="true" />
          </span>
          {title}
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${isOpen ? 'rotate-180 bg-blue-100 text-blue-600' : 'text-slate-400'}`}
        >
          <i className="fas fa-chevron-down text-sm" aria-hidden="true" />
        </span>
      </button>
      {isOpen && (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-toggle`}>
          <div className="space-y-6 border-t border-slate-100 p-4 pt-3 sm:p-6 sm:pt-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};
