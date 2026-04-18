"use client";

import { useEffect } from "react";

const STYLE_ID = "shift-sheet-print-rules";

/**
 * シフト表ページ表示中だけ head に印刷用 CSS を載せる（横向き・チャンク改ページ）。
 * アンマウントで削除し、他画面の印刷に landscape が残らないようにする。
 */
export function ShiftPrintStyles() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = `
@media print {
  @page {
    size: landscape;
    margin: 8mm;
  }
  .shift-print-chunk-break {
    page-break-after: always;
    break-after: page;
  }
}
`;
    document.head.appendChild(el);
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);
  return null;
}
