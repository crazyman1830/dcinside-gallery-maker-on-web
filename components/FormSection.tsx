
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
  iconColorClass = "text-slate-500",
  isOpen,
  onToggle,
  children,
  id
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-md">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex justify-between items-center p-5 text-left focus:outline-none transition-colors duration-200 ${isOpen ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
      >
        <h3 className="text-lg font-bold text-slate-700 flex items-center">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${isOpen ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
             <i className={`${iconClass} ${iconColorClass}`}></i>
          </div>
          {title}
        </h3>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-blue-100 text-blue-600 rotate-180' : 'text-slate-400'}`}>
            <i className="fas fa-chevron-down text-sm"></i>
        </div>
      </button>
      <div 
        id={`${id}-panel`} 
        className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-6 pt-2 border-t border-slate-100 space-y-6">
            {children}
        </div>
      </div>
    </div>
  );
};
