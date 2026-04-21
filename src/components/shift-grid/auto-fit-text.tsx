"use client";

import React, { useLayoutEffect, useRef } from "react";

type Props = {
  text: string;
  /** 初期フォントサイズ（px） */
  baseSize?: number;
  /** 最小フォントサイズ（px） */
  minSize?: number;
  /** 追加 className（色クラスなど） */
  className?: string;
  /** span に付与するスタイル */
  style?: React.CSSProperties;
};

/**
 * 親要素の幅に収まるように、フォントサイズを自動で縮小表示するコンポーネント。
 * 1行表示（whitespace-nowrap）を維持したまま、はみ出さないサイズまで文字を小さくする。
 */
export function AutoFitText({
  text,
  baseSize = 8,
  minSize = 5,
  className = "",
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const span = spanRef.current;
    if (!container || !span) return;

    const fit = () => {
      let current = baseSize;
      span.style.fontSize = `${current}px`;
      const cw = container.clientWidth;
      if (cw <= 0) return;
      // 収まるまで 0.25px 刻みで縮小
      while (current > minSize && span.scrollWidth > cw) {
        current -= 0.25;
        span.style.fontSize = `${current}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text, baseSize, minSize]);

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden ${className}`}
      title={text}
    >
      <span
        ref={spanRef}
        className="inline-block whitespace-nowrap leading-tight"
        style={{ fontSize: `${baseSize}px`, ...style }}
      >
        {text}
      </span>
    </div>
  );
}
