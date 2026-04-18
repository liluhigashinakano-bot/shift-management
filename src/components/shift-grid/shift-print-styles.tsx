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
    margin: 5mm;
  }
  /* チャンク間のみ改ページ（1〜8日・9〜15日…を別紙に） */
  .shift-print-chunk-break {
    page-break-after: always;
    break-after: page;
  }
  /* 各チャンク（最大8日分の表）を1枚に収める：横にはみ出して列が分割されないよう縮小 */
  .shift-print-grid-root > * + * {
    margin-top: 0 !important;
  }
  .shift-print-chunk {
    page-break-inside: avoid;
    break-inside: avoid-page;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    /* 表は最小幅 ~1190px なので横向きでも縮小しないと列が次ページに送られる */
    zoom: 0.74;
  }
  @supports not (zoom: 1) {
    .shift-print-chunk {
      zoom: unset;
    }
    .shift-print-chunk .shift-print-table-shell {
      transform: scale(0.74);
      transform-origin: top left;
      width: 135%;
      max-width: none;
      margin-bottom: -25%;
    }
  }
  .shift-print-chunk .shift-print-table-shell {
    min-width: 0 !important;
    overflow: visible !important;
    max-width: 100% !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .shift-print-chunk table {
    width: 100% !important;
    max-width: 100% !important;
  }
  thead {
    break-inside: avoid;
    break-after: avoid;
  }
  tbody.shift-print-summary-tbody {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
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
