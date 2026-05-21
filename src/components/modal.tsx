"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-0 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="app-modal-title" className="text-base font-bold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-lg leading-none text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
