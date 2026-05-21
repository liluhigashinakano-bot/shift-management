"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function removeStaleOverlayState() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => {
    if (dialog instanceof HTMLDialogElement) {
      dialog.close();
    }
  });

  const visiblePopup = Array.from(
    document.querySelectorAll(
      '[data-slot="sheet-content"], [data-slot="dialog-content"]',
    ),
  ).some(isVisibleElement);

  if (!visiblePopup) {
    document
      .querySelectorAll('[data-slot="sheet-overlay"], [data-slot="dialog-overlay"]')
      .forEach((overlay) => overlay.remove());
  }

  document.querySelectorAll("[inert]").forEach((element) => {
    element.removeAttribute("inert");
  });
  document.body.style.pointerEvents = "";
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}

export function StaleOverlayGuard() {
  const pathname = usePathname();

  useEffect(() => {
    removeStaleOverlayState();
    const raf = window.requestAnimationFrame(removeStaleOverlayState);
    const timeout = window.setTimeout(removeStaleOverlayState, 300);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [pathname]);

  return null;
}
