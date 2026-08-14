import React from 'react';

interface WarningMessageProps {
  message: string;
}

export const WarningMessage: React.FC<WarningMessageProps> = ({ message }) => (
  <div
    className="my-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-amber-800"
    role="status"
    aria-live="polite"
  >
    <strong className="font-bold">
      <i className="fas fa-exclamation-circle mr-2" aria-hidden="true" />
      안내:
    </strong>
    <span className="block sm:inline sm:ml-2">{message}</span>
  </div>
);
