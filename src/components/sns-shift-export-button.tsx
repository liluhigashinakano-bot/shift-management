"use client";

import { useMemo, useState } from "react";
import { ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { castSuffixForShiftBadge } from "@/lib/cast-display-name";

type ExportShiftSlot = {
  castId: string;
  timeSlot: number;
  cast: {
    name: string;
    isTrialGuest?: boolean | null;
  };
};

type ExportShiftDay = {
  id: string;
  date: string;
  shiftSlots: ExportShiftSlot[];
};

type Props = {
  storeName: string;
  year: number;
  month: number;
  half: string;
  shiftDays: ExportShiftDay[];
};

type CalendarCell = {
  day: number | null;
  key: string | null;
};

const CANVAS_WIDTH = 3508;
const CANVAS_HEIGHT = 2480;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildCalendarWeeks(year: number, month: number, half: string): CalendarCell[][] {
  const startDay = half === "first" ? 1 : 16;
  const endDay = half === "first" ? 15 : new Date(year, month, 0).getDate();
  const firstDate = new Date(year, month - 1, startDay);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstDate.getDay(); i++) {
    cells.push({ day: null, key: null });
  }

  for (let day = startDay; day <= endDay; day++) {
    cells.push({ day, key: dateKey(year, month, day) });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, key: null });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function normalizeDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function getHalfLabel(half: string): string {
  return half === "first" ? "前半" : "後半";
}

function drawSoftBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#fff6fb");
  base.addColorStop(0.35, "#ffe8ef");
  base.addColorStop(0.65, "#fffaf7");
  base.addColorStop(1, "#ffd8e4");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const washes = [
    { x: 280, y: 270, r: 620, color: "rgba(248, 155, 190, 0.34)" },
    { x: 1120, y: 260, r: 760, color: "rgba(255, 228, 202, 0.42)" },
    { x: 2360, y: 410, r: 820, color: "rgba(255, 245, 250, 0.88)" },
    { x: 3180, y: 2200, r: 880, color: "rgba(244, 114, 182, 0.32)" },
    { x: 2450, y: 1830, r: 740, color: "rgba(255, 255, 255, 0.64)" },
    { x: 460, y: 1730, r: 780, color: "rgba(255, 255, 255, 0.58)" },
    { x: 1760, y: 1280, r: 1050, color: "rgba(255, 232, 238, 0.42)" },
  ];

  for (const wash of washes) {
    const gradient = ctx.createRadialGradient(wash.x, wash.y, 0, wash.x, wash.y, wash.r);
    gradient.addColorStop(0, wash.color);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(wash.x, wash.y, wash.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 28; i++) {
    const x = (i * 421) % width;
    const y = (i * 263) % height;
    ctx.beginPath();
    ctx.ellipse(x, y, 260 + (i % 4) * 36, 120 + (i % 3) * 42, (i % 7) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    font: string;
    fill: string;
    stroke: string;
    lineWidth: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  },
) {
  ctx.save();
  ctx.font = options.font;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = options.baseline ?? "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = options.stroke;
  ctx.lineWidth = options.lineWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = options.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#b04b7c";
  ctx.fillStyle = "#b04b7c";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, 56);
  ctx.lineTo(0, -58);
  ctx.stroke();

  for (const angle of [-125, -55, 0, 55, 125]) {
    ctx.save();
    ctx.rotate((angle * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(16, -44, 0, -74);
    ctx.quadraticCurveTo(-16, -44, 0, -12);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, -5, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
  fontFamily: string,
  weight = "700",
): number {
  for (let size = preferredSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

function drawCastName(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
) {
  const fontFamily = '"Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
  const size = fitFontSize(ctx, text, maxWidth, fontSize, 30, fontFamily, "800");
  drawOutlinedText(ctx, text, x, y, {
    font: `800 ${size}px ${fontFamily}`,
    fill: "#111111",
    stroke: "rgba(255, 255, 255, 0.96)",
    lineWidth: Math.max(8, size * 0.18),
    align: "center",
    baseline: "middle",
  });
}

function drawCalendar(
  ctx: CanvasRenderingContext2D,
  props: Props,
  namesByDay: Map<string, string[]>,
) {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const halfLabel = getHalfLabel(props.half);

  drawSoftBackground(ctx, width, height);

  drawOutlinedText(ctx, `${props.month}月${halfLabel}`, 90, 168, {
    font: '800 138px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
    fill: "#f6f7f8",
    stroke: "#8b8b8b",
    lineWidth: 12,
  });

  drawBrandMark(ctx, width - 700, 124, 1.05);
  ctx.fillStyle = "#a94778";
  ctx.font = '400 170px Georgia, "Times New Roman", serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Lilu", width - 570, 150);
  ctx.font = '500 55px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
  ctx.fillStyle = "rgba(95, 68, 78, 0.82)";
  ctx.fillText("Girls bar", width - 555, 222);
  ctx.font = '700 40px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
  ctx.fillStyle = "rgba(95, 68, 78, 0.72)";
  ctx.textAlign = "right";
  ctx.fillText(props.storeName, width - 105, 272);

  const weeks = buildCalendarWeeks(props.year, props.month, props.half);
  const gridX = 100;
  const gridY = 360;
  const gridW = width - gridX * 2;
  const gridH = height - gridY - 145;
  const colW = gridW / 7;
  const weekdayH = 220;
  const dateH = weeks.length >= 4 ? 82 : 112;
  const bodyH = (gridH - weekdayH - dateH * weeks.length) / weeks.length;
  const lineColor = "rgba(122, 122, 122, 0.82)";

  ctx.save();
  ctx.lineWidth = 8;
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = "rgba(255, 255, 255, 0.54)";
  ctx.fillRect(gridX, gridY, gridW, gridH);
  ctx.strokeRect(gridX, gridY, gridW, gridH);

  for (let col = 0; col < 7; col++) {
    const x = gridX + col * colW;
    ctx.fillStyle =
      col === 0
        ? "rgba(255, 205, 220, 0.5)"
        : col === 6
          ? "rgba(219, 243, 255, 0.42)"
          : "rgba(255, 255, 255, 0.48)";
    ctx.fillRect(x, gridY, colW, weekdayH);

    ctx.fillStyle = col === 0 ? "#d94672" : col === 6 ? "#1887a8" : "#8a8a8a";
    ctx.font = '500 102px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(WEEKDAYS[col], x + colW / 2, gridY + weekdayH / 2 + 4);
  }

  for (let col = 1; col < 7; col++) {
    const x = gridX + col * colW;
    ctx.beginPath();
    ctx.moveTo(x, gridY);
    ctx.lineTo(x, gridY + gridH);
    ctx.stroke();
  }

  let rowY = gridY + weekdayH;
  for (const week of weeks) {
    ctx.beginPath();
    ctx.moveTo(gridX, rowY);
    ctx.lineTo(gridX + gridW, rowY);
    ctx.stroke();

    for (let col = 0; col < 7; col++) {
      const cell = week[col];
      const x = gridX + col * colW;
      const isWeekend = col === 0 || col === 6;
      ctx.fillStyle = isWeekend ? "rgba(255, 238, 245, 0.36)" : "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(x, rowY, colW, dateH);

      if (cell.day !== null) {
        drawOutlinedText(ctx, String(cell.day), x + colW / 2, rowY + dateH / 2 + 7, {
          font: '800 72px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
          fill: "#f8f8f8",
          stroke: "#9b9b9b",
          lineWidth: 8,
          align: "center",
          baseline: "middle",
        });
      }
    }

    ctx.beginPath();
    ctx.moveTo(gridX, rowY + dateH);
    ctx.lineTo(gridX + gridW, rowY + dateH);
    ctx.stroke();

    for (let col = 0; col < 7; col++) {
      const cell = week[col];
      const x = gridX + col * colW;
      const y = rowY + dateH;
      ctx.fillStyle = col === 6 ? "rgba(255, 230, 239, 0.2)" : "rgba(255, 255, 255, 0.22)";
      ctx.fillRect(x, y, colW, bodyH);

      const names = cell.key ? (namesByDay.get(cell.key) ?? []) : [];
      if (names.length > 0) {
        const topPadding = 48;
        const bottomPadding = 32;
        const availableH = bodyH - topPadding - bottomPadding;
        const maxLineH = weeks.length >= 4 ? 60 : 72;
        const maxLinesPerColumn = Math.max(3, Math.floor(availableH / maxLineH));
        const columns = Math.min(3, Math.ceil(names.length / maxLinesPerColumn));
        const linesPerColumn = Math.ceil(names.length / columns);
        const columnW = (colW - 42) / columns;
        const lineH = Math.min(maxLineH, availableH / Math.max(1, linesPerColumn));
        const fontSize = Math.min(62, Math.max(42, lineH * 0.78));

        names.forEach((name, index) => {
          const column = Math.floor(index / linesPerColumn);
          const row = index % linesPerColumn;
          const textX = x + 21 + columnW * column + columnW / 2;
          const textY = y + topPadding + row * lineH + lineH / 2;
          drawCastName(ctx, name, textX, textY, columnW - 18, fontSize);
        });
      }
    }

    rowY += dateH + bodyH;
  }

  ctx.restore();
}

export function SnsShiftExportButton({
  storeName,
  year,
  month,
  half,
  shiftDays,
}: Props) {
  const [exporting, setExporting] = useState(false);

  const namesByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const day of shiftDays) {
      const seen = new Set<string>();
      const names: string[] = [];
      const sortedSlots = [...day.shiftSlots].sort((a, b) => a.timeSlot - b.timeSlot);
      for (const slot of sortedSlots) {
        if (seen.has(slot.castId)) continue;
        seen.add(slot.castId);
        names.push(castSuffixForShiftBadge(slot.cast));
      }
      map.set(normalizeDateKey(day.date), names);
    }
    return map;
  }, [shiftDays]);

  const handleExport = () => {
    if (exporting) return;
    setExporting(true);

    window.requestAnimationFrame(() => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setExporting(false);
          return;
        }

        drawCalendar(ctx, { storeName, year, month, half, shiftDays }, namesByDay);
        canvas.toBlob((blob) => {
          if (!blob) {
            setExporting(false);
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = sanitizeFilename(
            `SNSシフト表_${storeName}_${year}年${month}月${getHalfLabel(half)}.png`,
          );
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setExporting(false);
        }, "image/png");
      } catch {
        setExporting(false);
      }
    });
  };

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      title="確定したシフトのキャストをSNS用A4横PNGで出力します。"
      className="h-6 border-pink-300/80 bg-pink-50/90 px-1.5 text-[clamp(8px,2.2vw,10px)] text-pink-900 hover:bg-pink-100 sm:px-2 whitespace-nowrap shrink-0"
      disabled={exporting}
      onClick={handleExport}
    >
      <ImageDown data-icon="inline-start" className="size-3" />
      {exporting ? "出力中" : "SNSシフト表出力"}
    </Button>
  );
}
