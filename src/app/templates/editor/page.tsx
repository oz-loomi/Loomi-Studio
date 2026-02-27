"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  Square2StackIcon,
  CheckIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  CodeBracketIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  LinkIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ClockIcon,
  UserCircleIcon,
  SparklesIcon,
  PencilSquareIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
  EnvelopeIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import Link from "next/link";
import { VariablePickerButton } from "@/components/variable-picker";
import { useAccount } from "@/contexts/account-context";
import { useUnsavedChanges } from "@/contexts/unsaved-changes-context";
import {
  componentSchemas,
  getAvailableComponents,
  type RepeatableGroup,
} from "@/lib/component-schemas";
import { parseTemplate, type ParsedTemplate } from "@/lib/template-parser";
import {
  buildPreviewVariableMap,
  findMissingPreviewVariables,
  type PreviewContact,
} from "@/lib/preview-variables";
import { ComponentIcon, SectionsIcon } from "@/components/icon-map";
import { CodeEditor } from "@/components/code-editor";
import { MediaPickerModal } from "@/components/media-picker-modal";

type EditorMode = "code" | "visual";
type VisualTab = "settings" | "components";

interface TemplateHistoryVersion {
  id: string;
  createdAt: string;
  size: number;
  createdBy?: string | null;
}

interface SimpleDiffLine {
  line: number;
  current: string;
  snapshot: string;
  kind: "changed" | "added" | "removed";
}

interface AssistantComponentEdit {
  key: string;
  value: string;
  reason?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildSimpleDiff(current: string, snapshot: string): SimpleDiffLine[] {
  const currentLines = current.split("\n");
  const snapshotLines = snapshot.split("\n");
  const max = Math.max(currentLines.length, snapshotLines.length);
  const lines: SimpleDiffLine[] = [];

  for (let i = 0; i < max; i += 1) {
    const cur = currentLines[i] ?? "";
    const old = snapshotLines[i] ?? "";
    if (cur === old) continue;
    lines.push({
      line: i + 1,
      current: cur,
      snapshot: old,
      kind: !old ? "added" : !cur ? "removed" : "changed",
    });
  }
  return lines;
}

// --- CSS unit helpers ---
// Strip "px" suffix so user sees just the number
function stripUnit(val: string): string {
  if (!val) return "";
  return val.replace(/px$/i, "");
}
// Ensure a value has "px" when stored (user types "50", we store "50px")
function ensureUnit(val: string): string {
  if (!val) return "";
  const stripped = val.replace(/px$/i, "").trim();
  if (!stripped) return "";
  if (stripped === "0") return "0px";
  // If it's a pure number, append px
  if (/^\d+(\.\d+)?$/.test(stripped)) return `${stripped}px`;
  // Already has a unit or is something like "50%"
  return stripped;
}

const FORCED_MOBILE_STYLE_ID = "loomi-forced-mobile-styles";
const FORCED_MOBILE_NORMALIZE_STYLE_ID = "loomi-forced-mobile-normalize";

function extractMax600MediaBlocks(cssText: string): string[] {
  if (!cssText) return [];
  const blocks: string[] = [];
  const mediaStart = /@media[^{]*max-width\s*:\s*600px[^{]*\{/gi;
  let match: RegExpExecArray | null;
  while ((match = mediaStart.exec(cssText)) !== null) {
    let i = match.index + match[0].length;
    const start = i;
    let depth = 1;
    while (i < cssText.length && depth > 0) {
      const ch = cssText[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const body = cssText.slice(start, i - 1).trim();
    if (body) blocks.push(body);
    mediaStart.lastIndex = i;
  }
  return blocks;
}

function syncPreviewMobileStyles(doc: Document, isMobile: boolean) {
  const existing = doc.getElementById(FORCED_MOBILE_STYLE_ID) as HTMLStyleElement | null;
  if (!isMobile) {
    existing?.remove();
    return;
  }

  const forcedRules: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.MEDIA_RULE) continue;
      const mediaRule = rule as CSSMediaRule;
      if (!/max-width\s*:\s*600px/i.test(mediaRule.conditionText)) continue;
      for (const nestedRule of Array.from(mediaRule.cssRules)) {
        forcedRules.push(nestedRule.cssText);
      }
    }
  }

  // Fallback: some in-body style tags can be omitted from cssRules enumeration in certain states.
  for (const styleEl of Array.from(doc.querySelectorAll("style"))) {
    const cssText = styleEl.textContent || "";
    forcedRules.push(...extractMax600MediaBlocks(cssText));
  }

  if (forcedRules.length === 0) {
    existing?.remove();
    return;
  }

  const styleEl = existing || doc.createElement("style");
  styleEl.id = FORCED_MOBILE_STYLE_ID;
  styleEl.textContent = forcedRules.join("\n");
  if (!existing) doc.head?.appendChild(styleEl);
}

function syncPreviewMobileNormalizeStyle(doc: Document, isMobile: boolean) {
  const existing = doc.getElementById(
    FORCED_MOBILE_NORMALIZE_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (!isMobile) {
    existing?.remove();
    return;
  }

  const css = `
    html, body {
      overflow-x: hidden !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    table.email-container,
    table[width="600"],
    table[width="600px"],
    table[style*="max-width: 600px"],
    table[style*="max-width:600px"] {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
    img[width="600"],
    img[width="600px"] {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
    }
    .loomi-btn-row {
      display: block !important;
      width: 100% !important;
    }
    .loomi-btn-row > td,
    .loomi-btn-gap,
    .loomi-btn-gap + td {
      display: block !important;
      width: 100% !important;
      padding-right: 0 !important;
    }
    .loomi-btn-table {
      width: 100% !important;
      max-width: 100% !important;
    }
    .mobile-stack {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .mobile-full-width {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    .loomi-btn-secondary-cell,
    .loomi-btn-gap + td {
      padding-top: 10px !important;
    }
    .loomi-btn-primary,
    .loomi-btn-secondary {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      text-align: center !important;
    }
    .loomi-btn-primary {
      margin-right: 0 !important;
    }
    .loomi-btn-secondary {
      margin-top: 10px !important;
    }
    .loomi-headline,
    .loomi-subheadline {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    td {
      min-width: 0 !important;
    }
    td, p, span, a, h1, h2, h3, h4, h5, h6, div {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `;

  const styleEl = existing || doc.createElement("style");
  styleEl.id = FORCED_MOBILE_NORMALIZE_STYLE_ID;
  styleEl.textContent = css;
  if (!existing) doc.head?.appendChild(styleEl);
}

function normalizePreviewMobileLayout(doc: Document, isMobile: boolean) {
  if (!isMobile) return;

  const root = doc.documentElement as HTMLElement | null;
  if (root) {
    root.style.overflowX = "hidden";
    root.style.maxWidth = "100%";
  }
  if (doc.body) {
    doc.body.style.overflowX = "hidden";
    doc.body.style.width = "100%";
    doc.body.style.maxWidth = "100%";
  }

  // Force classic email container tables (usually width="600") to fit mobile preview width.
  doc.querySelectorAll("table").forEach((node) => {
    const table = node as HTMLTableElement;
    const widthAttr = (table.getAttribute("width") || "").trim();
    const numericWidth = parseInt(widthAttr, 10);
    const inlineStyle = table.getAttribute("style") || "";
    const looksLikeDesktopContainer =
      (!Number.isNaN(numericWidth) && numericWidth >= 500) ||
      /max-width\s*:\s*600px/i.test(inlineStyle) ||
      table.classList.contains("email-container");
    if (!looksLikeDesktopContainer) return;
    table.setAttribute("width", "100%");
    table.style.width = "100%";
    table.style.maxWidth = "100%";
    table.style.minWidth = "0";
  });

  // Keep wide media assets inside viewport.
  doc.querySelectorAll("img[width]").forEach((node) => {
    const img = node as HTMLImageElement;
    const numericWidth = parseInt(img.getAttribute("width") || "", 10);
    if (Number.isNaN(numericWidth) || numericWidth < 500) return;
    img.style.maxWidth = "100%";
    img.style.width = "100%";
    img.style.height = "auto";
  });

  // Hero safe-mode: avoid side-by-side button overflow and long headline clipping.
  const normalizeHeroButtonRow = (row: HTMLElement) => {
    const table = row.closest("table") as HTMLTableElement | null;
    if (table) {
      table.style.width = "100%";
      table.style.maxWidth = "100%";
      table.style.minWidth = "0";
    }
    row.style.display = "block";
    row.style.width = "100%";
    const cells = Array.from(row.children).filter(
      (child) => child.tagName.toLowerCase() === "td",
    ) as HTMLTableCellElement[];
    const mobileGap = (cells[0]?.style.paddingRight || "10px").trim() || "10px";
    cells.forEach((td, idx) => {
      td.style.display = "block";
      td.style.width = "100%";
      td.style.maxWidth = "100%";
      td.style.paddingRight = "0";
      if (idx > 0) td.style.paddingTop = mobileGap;
    });
  };
  doc.querySelectorAll(".loomi-btn-row").forEach((node) => {
    normalizeHeroButtonRow(node as HTMLElement);
  });
  doc.querySelectorAll(".loomi-btn-gap").forEach((node) => {
    const td = node as HTMLTableCellElement;
    const row = td.parentElement;
    if (row && row.tagName.toLowerCase() === "tr") {
      normalizeHeroButtonRow(row as HTMLElement);
    }
  });
  doc.querySelectorAll(".loomi-btn-primary, .loomi-btn-secondary").forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty("display", "block", "important");
    el.style.setProperty("width", "100%", "important");
    el.style.setProperty("max-width", "100%", "important");
    el.style.setProperty("box-sizing", "border-box", "important");
    el.style.setProperty("text-align", "center", "important");
  });
  // Additional hard fallback: normalize button/table/cell sizing from anchors directly.
  doc
    .querySelectorAll("a.loomi-btn-primary, a.loomi-btn-secondary")
    .forEach((node) => {
      const anchor = node as HTMLElement;
      anchor.style.setProperty("display", "block", "important");
      anchor.style.setProperty("width", "100%", "important");
      anchor.style.setProperty("max-width", "100%", "important");
      anchor.style.setProperty("box-sizing", "border-box", "important");
      anchor.style.setProperty("text-align", "center", "important");

      const cell = anchor.closest("td") as HTMLTableCellElement | null;
      if (cell) {
        cell.style.setProperty("display", "block", "important");
        cell.style.setProperty("width", "100%", "important");
        cell.style.setProperty("max-width", "100%", "important");
        cell.style.setProperty("padding-right", "0", "important");
      }

      const table = anchor.closest("table") as HTMLTableElement | null;
      if (table && table.querySelector("a.loomi-btn-primary")) {
        table.style.setProperty("width", "100%", "important");
        table.style.setProperty("max-width", "100%", "important");
        table.style.setProperty("min-width", "0", "important");
      }
    });
  doc.querySelectorAll("table.loomi-btn-table").forEach((node) => {
    const table = node as HTMLTableElement;
    const primary = table.querySelector("a.loomi-btn-primary") as HTMLElement | null;
    const secondary = table.querySelector("a.loomi-btn-secondary") as HTMLElement | null;
    const mobileGap = (primary?.style.marginRight || "10px").trim() || "10px";
    if (primary) {
      primary.style.setProperty("margin-right", "0", "important");
    }
    if (secondary) {
      secondary.style.setProperty("margin-top", mobileGap, "important");
    }
  });
  doc.querySelectorAll(".loomi-headline, .loomi-subheadline").forEach((node) => {
    const el = node as HTMLElement;
    el.style.overflowWrap = "anywhere";
    el.style.wordBreak = "break-word";
  });
}

// --- Padding field component ---
// Parses CSS shorthand "10px 20px 30px 40px" into {top, right, bottom, left}
function parsePadding(value: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  if (!value) return { top: "", right: "", bottom: "", left: "" };
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1)
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2)
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3)
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function serializePadding(sides: {
  top: string;
  right: string;
  bottom: string;
  left: string;
}): string {
  const { top, right, bottom, left } = sides;
  if (!top && !right && !bottom && !left) return "";
  const t = ensureUnit(top) || "0px";
  const r = ensureUnit(right) || "0px";
  const b = ensureUnit(bottom) || "0px";
  const l = ensureUnit(left) || "0px";
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

// A single unit input with optional "px" suffix and hover stepper arrows
function DraggableUnitInput({
  value,
  placeholder,
  onChange,
  disabled,
  className,
  hideUnit,
}: {
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  className?: string;
  hideUnit?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const getNumeric = () =>
    parseInt(stripUnit(value) || stripUnit(placeholder) || "0", 10) || 0;

  const adjustValue = (delta: number) => {
    if (disabled) return;
    const newVal = Math.max(0, getNumeric() + delta);
    onChange(String(newVal));
  };

  const arrowOffsetClass = hideUnit ? "right-1.5" : "right-5";
  const placeholderText = stripUnit(placeholder) || "0";

  return (
    <div
      className="relative group"
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        type="text"
        value={stripUnit(value)}
        placeholder={placeholderText}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        disabled={disabled}
        className={`${className || ""} ${hideUnit ? "pr-4" : "pr-5"}`}
      />
      {!disabled && isHovered && (
        <div
          className={`absolute ${arrowOffsetClass} top-1/2 -translate-y-1/2 flex flex-col`}
        >
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              adjustValue(e.shiftKey ? 10 : 1);
            }}
            className="p-0 h-2.5 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            tabIndex={-1}
          >
            <ChevronUpIcon className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              adjustValue(e.shiftKey ? -10 : -1);
            }}
            className="p-0 h-2.5 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            tabIndex={-1}
          >
            <ChevronDownIcon className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
      {!hideUnit && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--muted-foreground)] pointer-events-none font-mono">
          px
        </span>
      )}
    </div>
  );
}

// ── Alignment icon SVGs (icons8 files) ──
const AlignLeftSvg = ({ rotate }: { rotate?: number }) => (
  <svg
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className="w-4 h-4"
    style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
  >
    <path d="M1.5 1C1.2236328 1 1 1.2236328 1 1.5v21C1 22.7763672 1.2236328 23 1.5 23S2 22.7763672 2 22.5v-21C2 1.2236328 1.7763672 1 1.5 1zM21 13H6c-1.1025391 0-2 .8969727-2 2v3c0 1.1030273.8974609 2 2 2h15c1.1025391 0 2-.8969727 2-2v-3C23 13.8969727 22.1025391 13 21 13zM22 18c0 .5512695-.4482422 1-1 1H6c-.5517578 0-1-.4487305-1-1v-3c0-.5512695.4482422-1 1-1h15c.5517578 0 1 .4487305 1 1V18zM6 11.0400391h9c1.1025391 0 2-.8969727 2-2V6c0-1.1030273-.8974609-2-2-2H6C4.8974609 4 4 4.8969727 4 6v3.0400391C4 10.1430664 4.8974609 11.0400391 6 11.0400391zM5 6c0-.5512695.4482422-1 1-1h9c.5517578 0 1 .4487305 1 1v3.0400391c0 .5512695-.4482422 1-1 1H6c-.5517578 0-1-.4487305-1-1V6z" />
  </svg>
);
const AlignCenterSvg = ({ rotate }: { rotate?: number }) => (
  <svg
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className="w-4 h-4"
    style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
  >
    <path d="M19,13h-6.5v-1.9599609H16c1.1025391,0,2-0.8969727,2-2V6c0-1.1030273-0.8974609-2-2-2h-3.5V0.5C12.5,0.2236328,12.2763672,0,12,0s-0.5,0.2236328-0.5,0.5V4H8C6.8974609,4,6,4.8969727,6,6v3.0400391c0,1.1030273,0.8974609,2,2,2h3.5V13H5c-1.1025391,0-2,0.8969727-2,2v3c0,1.1030273,0.8974609,2,2,2h6.5v3.5c0,0.2763672,0.2236328,0.5,0.5,0.5s0.5-0.2236328,0.5-0.5V20H19c1.1025391,0,2-0.8969727,2-2v-3C21,13.8969727,20.1025391,13,19,13z M16,5c0.5517578,0,1,0.4487305,1,1v3.0400391c0,0.5512695-0.4482422,1-1,1h-3.5V5H16z M8,10.0400391c-0.5517578,0-1-0.4487305-1-1V6c0-0.5512695,0.4482422-1,1-1h3.5v5.0400391H8z M5,19c-0.5517578,0-1-0.4487305-1-1v-3c0-0.5512695,0.4482422-1,1-1h6.5v5H5z M20,18c0,0.5512695-0.4482422,1-1,1h-6.5v-5H19c0.5517578,0,1,0.4487305,1,1V18z" />
  </svg>
);
const AlignRightSvg = ({ rotate }: { rotate?: number }) => (
  <svg
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className="w-4 h-4"
    style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
  >
    <path d="M22.5 1C22.2236328 1 22 1.2236328 22 1.5v21c0 .2763672.2236328.5.5.5s.5-.2236328.5-.5v-21C23 1.2236328 22.7763672 1 22.5 1zM18 13H3c-1.1025391 0-2 .8969727-2 2v3c0 1.1030273.8974609 2 2 2h15c1.1025391 0 2-.8969727 2-2v-3C20 13.8969727 19.1025391 13 18 13zM19 18c0 .5512695-.4482422 1-1 1H3c-.5517578 0-1-.4487305-1-1v-3c0-.5512695.4482422-1 1-1h15c.5517578 0 1 .4487305 1 1V18zM18 4H9C7.8974609 4 7 4.8969727 7 6v3.0400391c0 1.1030273.8974609 2 2 2h9c1.1025391 0 2-.8969727 2-2V6C20 4.8969727 19.1025391 4 18 4zM19 9.0400391c0 .5512695-.4482422 1-1 1H9c-.5517578 0-1-.4487305-1-1V6c0-.5512695.4482422-1 1-1h9c.5517578 0 1 .4487305 1 1V9.0400391z" />
  </svg>
);

/** Detect if a select field's options match the standard horizontal alignment set */
function isAlignmentOptions(options?: { label: string; value: string }[]): boolean {
  if (!options || options.length !== 3) return false;
  const vals = options.map(o => o.value);
  return vals[0] === 'left' && vals[1] === 'center' && vals[2] === 'right';
}

/** Detect if a select field's options match the standard vertical alignment set */
function isVerticalAlignOptions(options?: { label: string; value: string }[]): boolean {
  if (!options || options.length !== 3) return false;
  const vals = options.map(o => o.value);
  return vals[0] === 'top' && vals[1] === 'middle' && vals[2] === 'bottom';
}

/** Segmented icon buttons for alignment (Elementor-style) — works for both horizontal and vertical */
function AlignmentButtons({ value, onChange, vertical }: { value: string; onChange: (val: string) => void; vertical?: boolean }) {
  const rotation = vertical ? -90 : undefined;
  const opts = vertical
    ? [
        { value: 'top', icon: <AlignLeftSvg rotate={rotation} />, label: 'Top' },
        { value: 'middle', icon: <AlignCenterSvg rotate={rotation} />, label: 'Middle' },
        { value: 'bottom', icon: <AlignRightSvg rotate={rotation} />, label: 'Bottom' },
      ]
    : [
        { value: 'left', icon: <AlignLeftSvg />, label: 'Left' },
        { value: 'center', icon: <AlignCenterSvg />, label: 'Center' },
        { value: 'right', icon: <AlignRightSvg />, label: 'Right' },
      ];
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 flex items-center justify-center transition-colors ${
            value === o.value
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
          }`}
          title={o.label}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

/** Slider + number input combo for unit values (Elementor-style) */
function SliderUnitInput({
  value,
  placeholder,
  onChange,
  propKey,
}: {
  value: string;
  placeholder?: string;
  onChange: (val: string) => void;
  propKey?: string;
}) {
  // Smart max based on prop key
  const isBorderWidth = propKey ? /border.*width/i.test(propKey) : false;
  const isLargeDimension = propKey ? /width|height|max-width|max-height/i.test(propKey) : false;
  const isLetterSpacing = propKey ? /letter-spacing|spacing/i.test(propKey) : false;
  const max = isBorderWidth ? 20 : isLetterSpacing ? 20 : isLargeDimension ? 600 : 100;

  const numericValue = parseInt(stripUnit(value) || stripUnit(placeholder || '') || '0', 10) || 0;

  return (
    <div className="flex items-center gap-2 w-full">
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(numericValue, max)}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-1 h-1 range-slider"
      />
      <DraggableUnitInput
        value={value ? stripUnit(value) : ''}
        placeholder={stripUnit(placeholder || '') || '0'}
        onChange={onChange}
        className="w-[60px] bg-[var(--input)] border border-[var(--border)] rounded-lg pl-2 pr-5 py-1.5 text-xs text-center font-mono"
      />
    </div>
  );
}

function SpacingField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [linked, setLinked] = useState(() => {
    const parsed = parsePadding(value || placeholder || "");
    return (
      parsed.top === parsed.right &&
      parsed.right === parsed.bottom &&
      parsed.bottom === parsed.left
    );
  });

  const displayValue = value || placeholder || "";
  const sides = parsePadding(displayValue);
  const isUsingDefault = !value;
  const placeholderSides = parsePadding(placeholder || "");

  const handleSideChange = (
    side: "top" | "right" | "bottom" | "left",
    rawVal: string,
  ) => {
    const val = rawVal;
    if (linked) {
      onChange(
        serializePadding({ top: val, right: val, bottom: val, left: val }),
      );
    } else {
      const newSides = { ...sides, [side]: ensureUnit(val) };
      onChange(serializePadding(newSides));
    }
  };

  const toggleLinked = () => {
    if (!linked) {
      const uniform = stripUnit(sides.top) || "0";
      onChange(
        serializePadding({
          top: uniform,
          right: uniform,
          bottom: uniform,
          left: uniform,
        }),
      );
    }
    setLinked(!linked);
  };

  const inputClass = `w-full bg-[var(--input)] border border-[var(--border)] rounded-lg py-1.5 text-xs text-center font-mono ${isUsingDefault ? "text-[var(--muted-foreground)]" : ""}`;

  const gridCells: {
    key: "top" | "right" | "bottom" | "left";
    label: string;
  }[] = [
    { key: "top", label: "Top" },
    { key: "right", label: "Right" },
    { key: "bottom", label: "Bottom" },
    { key: "left", label: "Left" },
  ];

  return (
    <div className="flex items-start gap-1.5">
      <div className="flex gap-1 flex-1 min-w-0">
        {gridCells.map((cell) => (
          <div key={cell.key} className="flex-1 min-w-0">
            <DraggableUnitInput
              value={isUsingDefault ? "" : sides[cell.key]}
              placeholder={placeholderSides[cell.key]}
              onChange={(val) => handleSideChange(cell.key, val)}
              className={`${inputClass} px-1`}
            />
            <label className="text-[9px] text-[var(--muted-foreground)] block text-center mt-1 leading-none">
              {cell.label}
            </label>
          </div>
        ))}
      </div>
      <button
        onClick={toggleLinked}
        className={`w-7 h-7 self-start rounded-md flex items-center justify-center border transition-colors flex-shrink-0 ${linked ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--input)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"}`}
        title={linked ? "Unlink sides" : "Link all sides"}
      >
        <LinkIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// --- Border radius field (4 corners: TL, TR, BR, BL) ---
function parseBorderRadius(value: string): {
  tl: string;
  tr: string;
  br: string;
  bl: string;
} {
  if (!value) return { tl: "", tr: "", br: "", bl: "" };
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1)
    return { tl: parts[0], tr: parts[0], br: parts[0], bl: parts[0] };
  if (parts.length === 2)
    return { tl: parts[0], tr: parts[1], br: parts[0], bl: parts[1] };
  if (parts.length === 3)
    return { tl: parts[0], tr: parts[1], br: parts[2], bl: parts[1] };
  return { tl: parts[0], tr: parts[1], br: parts[2], bl: parts[3] };
}

function serializeBorderRadius(corners: {
  tl: string;
  tr: string;
  br: string;
  bl: string;
}): string {
  const { tl, tr, br, bl } = corners;
  if (!tl && !tr && !br && !bl) return "";
  const a = ensureUnit(tl) || "0px";
  const b = ensureUnit(tr) || "0px";
  const c = ensureUnit(br) || "0px";
  const d = ensureUnit(bl) || "0px";
  if (a === b && b === c && c === d) return a;
  if (a === c && b === d) return `${a} ${b}`;
  if (b === d) return `${a} ${b} ${c}`;
  return `${a} ${b} ${c} ${d}`;
}

function BorderRadiusField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [linked, setLinked] = useState(() => {
    const parsed = parseBorderRadius(value || placeholder || "");
    return (
      parsed.tl === parsed.tr &&
      parsed.tr === parsed.br &&
      parsed.br === parsed.bl
    );
  });

  const displayValue = value || placeholder || "";
  const corners = parseBorderRadius(displayValue);
  const isUsingDefault = !value;
  const placeholderCorners = parseBorderRadius(placeholder || "");

  const handleCornerChange = (
    corner: "tl" | "tr" | "br" | "bl",
    rawVal: string,
  ) => {
    if (linked) {
      onChange(
        serializeBorderRadius({
          tl: rawVal,
          tr: rawVal,
          br: rawVal,
          bl: rawVal,
        }),
      );
    } else {
      const newCorners = { ...corners, [corner]: ensureUnit(rawVal) };
      onChange(serializeBorderRadius(newCorners));
    }
  };

  const toggleLinked = () => {
    if (!linked) {
      const uniform = stripUnit(corners.tl) || "0";
      onChange(
        serializeBorderRadius({
          tl: uniform,
          tr: uniform,
          br: uniform,
          bl: uniform,
        }),
      );
    }
    setLinked(!linked);
  };

  const inputClass = `w-full bg-[var(--input)] border border-[var(--border)] rounded-lg py-1.5 text-xs text-center font-mono ${isUsingDefault ? "text-[var(--muted-foreground)]" : ""}`;

  const gridCells: {
    key: "tl" | "tr" | "br" | "bl";
    label: string;
    rotation: string;
  }[] = [
    { key: "tl", label: "TL", rotation: "-90" },
    { key: "tr", label: "TR", rotation: "0" },
    { key: "br", label: "BR", rotation: "90" },
    { key: "bl", label: "BL", rotation: "180" },
  ];

  return (
    <div className="flex items-start gap-1.5">
      <div className="flex gap-1 flex-1 min-w-0">
        {gridCells.map((cell) => (
          <div key={cell.key} className="flex-1 min-w-0">
            <DraggableUnitInput
              value={isUsingDefault ? "" : corners[cell.key]}
              placeholder={placeholderCorners[cell.key]}
              onChange={(val) => handleCornerChange(cell.key, val)}
              className={`${inputClass} px-1`}
            />
            <div className="flex justify-center mt-1">
              <svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-3.5 h-3.5 text-[var(--muted-foreground)]" style={{ transform: `rotate(${cell.rotation}deg)` }}><path d="M 7.5 6 A 1.5 1.5 0 0 0 7.5 9 A 1.5 1.5 0 0 0 7.5 6 z M 13.5 6 A 1.5 1.5 0 0 0 13.5 9 A 1.5 1.5 0 0 0 13.5 6 z M 19.5 6 A 1.5 1.5 0 0 0 19.5 9 A 1.5 1.5 0 0 0 19.5 6 z M 25.5 6 A 1.50015 1.50015 0 1 0 25.5 9 C 32.973281 9 39 15.026719 39 22.5 A 1.50015 1.50015 0 1 0 42 22.5 C 42 13.405281 34.594719 6 25.5 6 z M 40.5 27 A 1.5 1.5 0 0 0 40.5 30 A 1.5 1.5 0 0 0 40.5 27 z M 40.5 33 A 1.5 1.5 0 0 0 40.5 36 A 1.5 1.5 0 0 0 40.5 33 z M 40.5 39 A 1.5 1.5 0 0 0 40.5 42 A 1.5 1.5 0 0 0 40.5 39 z"/></svg>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={toggleLinked}
        className={`w-7 h-7 self-start rounded-md flex items-center justify-center border transition-colors flex-shrink-0 ${linked ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--input)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"}`}
        title={linked ? "Unlink corners" : "Link all corners"}
      >
        <LinkIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// Render a single form field
const VARIABLE_ELIGIBLE_TYPES = new Set(["text", "textarea", "url", "image"]);

function PropField({
  prop,
  value,
  onChange,
  onLiveStyle,
  onBrowseMedia,
  onInsertVariable,
}: {
  prop: {
    key: string;
    label: string;
    type: string;
    default?: string;
    placeholder?: string;
    options?: { label: string; value: string }[];
  };
  value: string;
  onChange: (val: string) => void;
  onLiveStyle?: (val: string) => void;
  onBrowseMedia?: () => void;
  onInsertVariable?: (token: string) => void;
}) {
  const placeholderText = prop.placeholder || prop.default;

  if (prop.type === "padding") {
    return (
      <SpacingField
        value={value}
        onChange={onChange}
        placeholder={placeholderText}
      />
    );
  }
  if (prop.type === "radius") {
    return (
      <BorderRadiusField
        value={value}
        onChange={onChange}
        placeholder={placeholderText}
      />
    );
  }
  if (prop.type === "unit") {
    return (
      <SliderUnitInput
        value={value}
        placeholder={placeholderText}
        onChange={(val) => onChange(val ? ensureUnit(val) : "")}
        propKey={prop.key}
      />
    );
  }
  if (prop.type === "color") {
    return (
      <div className="w-[124px] flex items-center bg-[var(--input)] border border-[var(--border)] rounded-lg overflow-hidden">
        <input
          type="color"
          value={value || placeholderText || "#000000"}
          onInput={(e) => onLiveStyle?.((e.target as HTMLInputElement).value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 cursor-pointer bg-transparent flex-shrink-0 border-none p-0.5"
        />
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-[82px] bg-transparent border-none px-2 py-1.5 text-xs font-mono outline-none"
          placeholder={placeholderText || "#000000"}
        />
      </div>
    );
  }
  if (prop.type === "select" && isAlignmentOptions(prop.options)) {
    return <AlignmentButtons value={value || prop.default || ""} onChange={onChange} />;
  }
  if (prop.type === "select" && isVerticalAlignOptions(prop.options)) {
    return <AlignmentButtons value={value || prop.default || ""} onChange={onChange} vertical />;
  }
  if (prop.type === "select") {
    return (
      <select
        value={value || prop.default || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
      >
        <option value="">Default</option>
        {prop.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (prop.type === "textarea") {
    return (
      <div className="relative">
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm resize-none"
          placeholder={placeholderText}
        />
        {onInsertVariable && (
          <div className="absolute top-1 right-1">
            <VariablePickerButton onInsert={onInsertVariable} />
          </div>
        )}
      </div>
    );
  }
  if (prop.type === "image") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
          placeholder={placeholderText || "Image URL..."}
        />
        {onInsertVariable && (
          <VariablePickerButton onInsert={onInsertVariable} />
        )}
        {onBrowseMedia && (
          <button
            type="button"
            onClick={onBrowseMedia}
            className="flex-shrink-0 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
            title="Browse media library"
          >
            <PhotoIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }
  if (prop.type === "toggle") {
    const isOn = (value || prop.default) === "true";
    return (
      <button
        onClick={() => onChange(isOn ? "false" : "true")}
        className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? "bg-[var(--primary)]" : "bg-zinc-600"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isOn ? "left-5" : "left-0.5"}`}
        />
      </button>
    );
  }
  // Text/URL/number — variable picker for eligible types
  if (onInsertVariable && prop.type !== "number") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
          placeholder={placeholderText}
        />
        <VariablePickerButton onInsert={onInsertVariable} />
      </div>
    );
  }

  return (
    <input
      type={prop.type === "number" ? "number" : "text"}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => e.currentTarget.blur()}
      className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
      placeholder={placeholderText}
    />
  );
}

// --- Group configuration for prop organization ---
const GROUP_CONFIG: Record<string, { label: string; order: number; defaultOpen?: boolean }> = {
  stats: { label: 'Stats', order: -1 },
  text: { label: 'Text', order: 0, defaultOpen: true },
  background: { label: 'Background', order: 1 },
  buttons: { label: 'Buttons', order: 2 },
  layout: { label: 'Layout', order: 3 },
  border: { label: 'Border', order: 4 },
  tracking: { label: 'Tracking', order: 5 },
};

// Button set tabs (Primary / Secondary toggle like Elementor's hover/active tabs)
function ButtonSetTabs({
  groupProps,
  activeTab,
  onTabChange,
  renderStandardProps,
  tabs = ["primary", "secondary"],
  hideTabsWhenSingle = false,
}: {
  groupProps: { key: string; label: string; type: string; buttonSet?: 'primary' | 'secondary'; [k: string]: unknown }[];
  activeTab: 'primary' | 'secondary';
  onTabChange: (tab: 'primary' | 'secondary') => void;
  renderStandardProps: (props: typeof groupProps) => React.ReactNode[];
  tabs?: ("primary" | "secondary")[];
  hideTabsWhenSingle?: boolean;
}) {
  const resolvedTabs: ("primary" | "secondary")[] =
    tabs.length > 0 ? tabs : ["primary"];
  const resolvedActiveTab = resolvedTabs.includes(activeTab) ? activeTab : resolvedTabs[0];
  const showTabs = !(hideTabsWhenSingle && resolvedTabs.length <= 1);
  const filteredProps = groupProps.filter(
    (p) => !p.buttonSet || p.buttonSet === resolvedActiveTab,
  );

  return (
    <div className="space-y-4">
      {showTabs && (
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          {resolvedTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                resolvedActiveTab === tab
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}
      {renderStandardProps(filteredProps as typeof groupProps)}
    </div>
  );
}

// Collapsible prop group wrapper (Elementor-style section separators)
function CollapsiblePropGroup({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 pt-3.5 pb-2.5 text-left group/grp"
      >
        <ChevronRightIcon
          className="chevron-icon w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0"
          data-open={isOpen}
        />
        <span className="text-[11px] font-semibold text-[var(--foreground)] uppercase tracking-wider">
          {label}
        </span>
      </button>
      <div className="collapsible-wrapper" data-open={isOpen}>
        <div className="collapsible-inner">
          <div className="space-y-4 pb-4 px-px">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Elementor-style border editor: type + linked side widths + color
function BorderSideEditor({
  props: allBorderProps,
  values,
  onChange,
  onLiveStyle,
}: {
  props: { key: string; label: string; type: string; default?: string; options?: { label: string; value: string }[] }[];
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onLiveStyle?: (key: string, val: string) => void;
}) {
  const sides = ["top", "right", "bottom", "left"] as const;
  type Side = (typeof sides)[number];
  const sideLabels: Record<Side, string> = {
    top: "Top",
    right: "Right",
    bottom: "Bottom",
    left: "Left",
  };

  // Find the "all sides" shorthand props (no -top/-right/-bottom/-left in key)
  const findShorthand = (type: string) =>
    allBorderProps.find(
      (p) => p.type === type && !p.key.match(/-(top|right|bottom|left)-/),
    );
  const shorthandStyle = findShorthand("select");
  const shorthandWidth = allBorderProps.find(
    (p) =>
      (p.type === "text" || p.type === "unit") &&
      !p.key.match(/-(top|right|bottom|left)-/) &&
      p.key.includes("width"),
  );
  const shorthandColor = allBorderProps.find(
    (p) => p.type === "color" && !p.key.match(/-(top|right|bottom|left)-/),
  );

  // If this is a divider-style border (no per-side props), render differently
  const hasPerSide = allBorderProps.some((p) =>
    p.key.match(/-(top|right|bottom|left)-/),
  );

  // Find per-side props by pattern
  const findSideProp = (side: Side, type: "style" | "width" | "color") => {
    if (type === "style")
      return allBorderProps.find((p) => p.key.endsWith(`-${side}-style`));
    if (type === "width")
      return allBorderProps.find((p) => p.key.endsWith(`-${side}-width`));
    return allBorderProps.find((p) => p.key.endsWith(`-${side}-color`));
  };

  const sidePropMap: Record<
    Side,
    {
      style?: (typeof allBorderProps)[number];
      width?: (typeof allBorderProps)[number];
      color?: (typeof allBorderProps)[number];
    }
  > = {
    top: {
      style: findSideProp("top", "style"),
      width: findSideProp("top", "width"),
      color: findSideProp("top", "color"),
    },
    right: {
      style: findSideProp("right", "style"),
      width: findSideProp("right", "width"),
      color: findSideProp("right", "color"),
    },
    bottom: {
      style: findSideProp("bottom", "style"),
      width: findSideProp("bottom", "width"),
      color: findSideProp("bottom", "color"),
    },
    left: {
      style: findSideProp("left", "style"),
      width: findSideProp("left", "width"),
      color: findSideProp("left", "color"),
    },
  };

  const [linked, setLinked] = useState<boolean>(() => {
    const globalWidth =
      (shorthandWidth && (values[shorthandWidth.key] || shorthandWidth.default)) ||
      "0px";
    const widths = sides.map((side) => {
      const sideWidth = sidePropMap[side].width;
      return (sideWidth && values[sideWidth.key]) || globalWidth;
    });
    return widths.every((w) => w === widths[0]);
  });

  if (!hasPerSide) {
    // Simple border (e.g. divider, footer divider-color) — let standard renderer handle it.
    return null;
  }
  if (!shorthandStyle || !shorthandWidth || !shorthandColor) return null;
  if (
    !sides.every(
      (side) =>
        sidePropMap[side].style &&
        sidePropMap[side].width &&
        sidePropMap[side].color,
    )
  ) {
    return null;
  }

  const sideStyleKey = (side: Side) => sidePropMap[side].style!.key;
  const sideWidthKey = (side: Side) => sidePropMap[side].width!.key;
  const sideColorKey = (side: Side) => sidePropMap[side].color!.key;
  const borderRadiusProp =
    allBorderProps.find(
      (p) =>
        p.type === "radius" &&
        (p.key === "radius" || p.key.endsWith("-radius")),
    ) || allBorderProps.find((p) => p.type === "radius");

  const globalStyle =
    values[shorthandStyle.key] || shorthandStyle.default || "none";
  const globalWidth = values[shorthandWidth.key] || shorthandWidth.default || "0px";
  const globalColor = values[shorthandColor.key] || shorthandColor.default || "";

  const handleBorderTypeChange = (nextType: string) => {
    onChange(shorthandStyle.key, nextType);
    // Border type UI is global in this editor; keep side styles in sync
    // regardless of width link state.
    sides.forEach((side) => onChange(sideStyleKey(side), nextType));
  };

  const handleBorderColorChange = (nextColor: string) => {
    onChange(shorthandColor.key, nextColor);
    // Border color UI is global in this editor; keep side colors in sync
    // regardless of width link state.
    sides.forEach((side) => onChange(sideColorKey(side), nextColor));
  };

  const applyGlobalStyleColorToSide = (side: Side) => {
    if (!values[sideStyleKey(side)] && globalStyle) {
      onChange(sideStyleKey(side), globalStyle);
    }
    if (!values[sideColorKey(side)] && globalColor) {
      onChange(sideColorKey(side), globalColor);
    }
  };

  const handleWidthChange = (side: Side, rawVal: string) => {
    const nextWidth = rawVal ? ensureUnit(rawVal) : "";
    if (linked) {
      onChange(shorthandWidth.key, nextWidth);
      sides.forEach((s) => {
        onChange(sideWidthKey(s), nextWidth);
        if (globalStyle) onChange(sideStyleKey(s), globalStyle);
        if (globalColor) onChange(sideColorKey(s), globalColor);
      });
      return;
    }

    onChange(sideWidthKey(side), nextWidth);
    applyGlobalStyleColorToSide(side);

    const nextWidths = sides.map((s) =>
      s === side ? nextWidth || globalWidth : values[sideWidthKey(s)] || globalWidth,
    );
    const allEqual = nextWidths.every((w) => w === nextWidths[0]);
    if (allEqual) onChange(shorthandWidth.key, nextWidths[0]);
  };

  const toggleLinked = () => {
    if (!linked) {
      const uniformWidth = values[sideWidthKey("top")] || globalWidth || "0px";
      onChange(shorthandWidth.key, uniformWidth);
      sides.forEach((side) => {
        onChange(sideWidthKey(side), uniformWidth);
        if (globalStyle) onChange(sideStyleKey(side), globalStyle);
        if (globalColor) onChange(sideColorKey(side), globalColor);
      });
    }
    setLinked((prev) => !prev);
  };

  const widthInputClass =
    "w-full bg-[var(--input)] border border-[var(--border)] rounded-lg py-1.5 text-xs text-center font-mono px-1";
  const hideBorderSizeAndColor = globalStyle === "none";

  return (
    <div className="space-y-3">
      <div className="w-full flex items-center justify-between gap-3">
        <label className="text-[11px] text-[var(--muted-foreground)]">
          Border Type
        </label>
        <select
          value={globalStyle}
          onChange={(e) => handleBorderTypeChange(e.target.value)}
          className="w-[124px] bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="">Default</option>
          {(shorthandStyle.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {!hideBorderSizeAndColor && (
        <>
          <div>
            <label className="text-[11px] text-[var(--muted-foreground)] mb-1 block">
              Border Width
            </label>
            <div className="flex items-start gap-1.5">
              <div className="flex gap-1 flex-1 min-w-0">
                {sides.map((side) => (
                  <div key={side} className="flex-1 min-w-0">
                    <DraggableUnitInput
                      value={linked ? values[sideWidthKey(side)] || globalWidth : values[sideWidthKey(side)] || ""}
                      placeholder={stripUnit(globalWidth || "0px")}
                      onChange={(val) => handleWidthChange(side, val)}
                      className={widthInputClass}
                    />
                    <label className="text-[9px] text-[var(--muted-foreground)] block text-center mt-1 leading-none">
                      {sideLabels[side]}
                    </label>
                  </div>
                ))}
              </div>
              <button
                onClick={toggleLinked}
                className={`w-7 h-7 self-start rounded-md flex items-center justify-center border transition-colors flex-shrink-0 ${linked ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--input)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"}`}
                title={linked ? "Unlink sides" : "Link all sides"}
              >
                <LinkIcon className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="w-full flex items-center justify-between gap-3">
            <label className="text-[11px] text-[var(--muted-foreground)]">
              Border Color
            </label>
            <div className="w-[124px] flex items-center bg-[var(--input)] border border-[var(--border)] rounded-lg overflow-hidden">
              <input
                type="color"
                value={values[shorthandColor.key] || shorthandColor.default || "#000000"}
                onInput={(e) =>
                  onLiveStyle?.(shorthandColor.key, (e.target as HTMLInputElement).value)
                }
                onChange={(e) => handleBorderColorChange(e.target.value)}
                className="w-8 h-8 cursor-pointer bg-transparent flex-shrink-0 border-none p-0.5"
              />
              <input
                type="text"
                value={values[shorthandColor.key] || ""}
                onChange={(e) => handleBorderColorChange(e.target.value)}
                className="w-[82px] bg-transparent border-none px-2 py-1.5 text-xs font-mono outline-none"
                placeholder={shorthandColor.default || "#000000"}
              />
            </div>
          </div>
        </>
      )}

      {borderRadiusProp && (
        <div>
          <label className="text-[11px] text-[var(--muted-foreground)] mb-1 block">
            Border Radius
          </label>
          <PropField
            prop={borderRadiusProp}
            value={values[borderRadiusProp.key] || ""}
            onChange={(val) => onChange(borderRadiusProp.key, val)}
            onLiveStyle={
              onLiveStyle
                ? (val) => onLiveStyle(borderRadiusProp.key, val)
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

type EditableProp = {
  key: string;
  label: string;
  type: string;
  default?: string;
  options?: { label: string; value: string }[];
  half?: boolean;
  placeholder?: string;
  group?: string;
  conditionalOn?: string;
  buttonSet?: "primary" | "secondary";
  responsive?: boolean;
  separator?: boolean;
};

function HeroBackgroundEditor({
  props: groupProps,
  values,
  onChange,
  onBrowseMedia,
  previewWidth,
}: {
  props: EditableProp[];
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onBrowseMedia?: (propKey: string) => void;
  previewWidth: "desktop" | "mobile";
}) {
  const gradientKeys = new Set([
    "gradient-type",
    "gradient-angle",
    "gradient-direction",
    "gradient-start",
    "gradient-start-position",
    "gradient-end",
    "gradient-end-position",
  ]);
  const gradientPropsArr = groupProps.filter((p) => gradientKeys.has(p.key));

  const typeProp = gradientPropsArr.find((p) => p.key === "gradient-type");
  const angleProp = gradientPropsArr.find((p) => p.key === "gradient-angle");
  const startProp = gradientPropsArr.find((p) => p.key === "gradient-start");
  const endProp = gradientPropsArr.find((p) => p.key === "gradient-end");
  const startPosProp = gradientPropsArr.find(
    (p) => p.key === "gradient-start-position",
  );
  const endPosProp = gradientPropsArr.find((p) => p.key === "gradient-end-position");
  const bgImageProp = groupProps.find((p) => p.key === "bg-image");
  const fallbackBgProp = groupProps.find((p) => p.key === "fallback-bg");
  const overlayOpacityProp = groupProps.find((p) => p.key === "overlay-opacity");
  const cssGradientProp = groupProps.find((p) => p.key === "gradient");

  const gradType = typeProp
    ? values[typeProp.key] || typeProp.default || "none"
    : "none";
  const isGradientMode = gradType !== "none" && gradType !== "";
  const startColor = startProp
    ? values[startProp.key] || startProp.default || "#000000"
    : "#000000";
  const endColor = endProp
    ? values[endProp.key] || endProp.default || "#ffffff"
    : "#ffffff";

  const clamp = (raw: string, fallback: number, min: number, max: number) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const startPos = clamp(values[startPosProp?.key || ""], 0, 0, 100);
  const endPos = clamp(values[endPosProp?.key || ""], 100, 0, 100);
  const angle = clamp(values[angleProp?.key || ""], 180, 0, 360);
  const overlayRaw = overlayOpacityProp
    ? Number(values[overlayOpacityProp.key] || overlayOpacityProp.default || "0")
    : 0;
  const overlayOpacity = Number.isFinite(overlayRaw)
    ? Math.max(0, Math.min(100, overlayRaw))
    : 0;

  const setGradientMode = (mode: "classic" | "gradient") => {
    if (!typeProp) return;
    if (mode === "classic") {
      onChange(typeProp.key, "none");
      return;
    }
    const nextType = gradType === "none" ? "linear" : gradType;
    onChange(typeProp.key, nextType);
    if (startProp && !values[startProp.key]) onChange(startProp.key, "#000000");
    if (endProp && !values[endProp.key]) onChange(endProp.key, "#ffffff");
    if (startPosProp && !values[startPosProp.key]) onChange(startPosProp.key, "0");
    if (endPosProp && !values[endPosProp.key]) onChange(endPosProp.key, "100");
    if (angleProp && !values[angleProp.key]) onChange(angleProp.key, "180");
  };

  const previewGrad =
    gradType === "radial"
      ? `radial-gradient(circle, ${startColor} ${startPos}%, ${endColor} ${endPos}%)`
      : `linear-gradient(${angle}deg, ${startColor} ${startPos}%, ${endColor} ${endPos}%)`;

  const DeviceIcon = previewWidth === "mobile" ? DevicePhoneMobileIcon : ComputerDesktopIcon;
  const iconColorClass =
    previewWidth === "mobile"
      ? "text-[var(--primary)]"
      : "text-[var(--muted-foreground)]";
  const deviceTitle =
    previewWidth === "mobile"
      ? "Mobile preview"
      : "Desktop preview";

  const RangeRow = ({
    label,
    value,
    min,
    max,
    unit,
    propKey,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    unit: "%" | "deg";
    propKey: string;
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
          {label}
          <DeviceIcon className={`w-3.5 h-3.5 ${iconColorClass}`} title={deviceTitle} />
        </label>
        <span className="text-[11px] text-[var(--muted-foreground)]">{unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(propKey, e.target.value)}
          className="flex-1 range-slider"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(propKey, e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          className="w-16 bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--muted-foreground)]">
          Background Type
        </span>
        <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setGradientMode("classic")}
            className={`px-2.5 py-1.5 border-r border-[var(--border)] ${!isGradientMode ? "bg-[var(--primary)] text-white" : "bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            title="Image / Classic"
          >
            <PhotoIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setGradientMode("gradient")}
            className={`px-2.5 py-1.5 ${isGradientMode ? "bg-[var(--primary)] text-white" : "bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            title="Gradient"
          >
            <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/25 p-3">
        {bgImageProp && (
          <div>
            <label className="text-[11px] text-[var(--muted-foreground)] mb-1 block">
              {bgImageProp.label}
            </label>
            <PropField
              prop={bgImageProp}
              value={values[bgImageProp.key] || ""}
              onChange={(val) => onChange(bgImageProp.key, val)}
              onBrowseMedia={onBrowseMedia ? () => onBrowseMedia(bgImageProp.key) : undefined}
            />
          </div>
        )}

        {fallbackBgProp && (
          <div className="w-full flex items-center justify-between gap-3">
            <label className="text-[11px] text-[var(--muted-foreground)]">
              {fallbackBgProp.label}
            </label>
            <PropField
              prop={fallbackBgProp}
              value={values[fallbackBgProp.key] || ""}
              onChange={(val) => onChange(fallbackBgProp.key, val)}
            />
          </div>
        )}

        {overlayOpacityProp && (
          <div className="space-y-1.5">
            <label className="text-[11px] text-[var(--muted-foreground)]">
              {overlayOpacityProp.label}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={overlayOpacity}
                onChange={(e) => onChange(overlayOpacityProp.key, e.target.value)}
                className="flex-1 range-slider"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={overlayOpacity}
                onChange={(e) => onChange(overlayOpacityProp.key, e.target.value)}
                className="w-16 bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-[11px] text-[var(--muted-foreground)]">%</span>
            </div>
          </div>
        )}

        {isGradientMode && gradientPropsArr.length > 0 && (
          <>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
              <p className="text-[11px] italic text-[var(--muted-foreground)] leading-5 border-l-2 border-amber-400 pl-2.5">
                Set locations and angle for each breakpoint so the gradient adapts to different screen sizes.
              </p>
            </div>

            <div
              className="h-11 w-full rounded-md border border-[var(--border)]"
              style={{ background: previewGrad }}
            />

            {startProp && (
              <div className="w-full flex items-center justify-between gap-3">
                <label className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0 leading-tight whitespace-nowrap">
                  Color
                </label>
                <div className="flex-shrink-0">
                  <PropField
                    prop={startProp}
                    value={values[startProp.key] || ""}
                    onChange={(val) => onChange(startProp.key, val)}
                  />
                </div>
              </div>
            )}

            {startPosProp && (
              <RangeRow
                label="Location"
                value={startPos}
                min={0}
                max={100}
                unit="%"
                propKey={startPosProp.key}
              />
            )}

            {endProp && (
              <div className="w-full flex items-center justify-between gap-3">
                <label className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0 leading-tight whitespace-nowrap">
                  Second Color
                </label>
                <div className="flex-shrink-0">
                  <PropField
                    prop={endProp}
                    value={values[endProp.key] || ""}
                    onChange={(val) => onChange(endProp.key, val)}
                  />
                </div>
              </div>
            )}

            {endPosProp && (
              <RangeRow
                label="Location"
                value={endPos}
                min={0}
                max={100}
                unit="%"
                propKey={endPosProp.key}
              />
            )}

            {typeProp && (
              <div className="w-full flex items-center justify-between gap-3">
                <label className="text-[11px] text-[var(--muted-foreground)]">Type</label>
                <select
                  value={gradType === "none" ? "linear" : gradType}
                  onChange={(e) => onChange(typeProp.key, e.target.value)}
                  className="w-36 bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
            )}

            {gradType === "linear" && angleProp && (
              <RangeRow
                label="Angle"
                value={angle}
                min={0}
                max={360}
                unit="deg"
                propKey={angleProp.key}
              />
            )}
          </>
        )}

        {cssGradientProp && (
          <details className="rounded-md border border-[var(--border)] bg-[var(--input)]/40 px-2.5 py-2">
            <summary className="text-[11px] text-[var(--muted-foreground)] cursor-pointer">
              Advanced CSS Gradient
            </summary>
            <div className="mt-2">
              <PropField
                prop={cssGradientProp}
                value={values[cssGradientProp.key] || ""}
                onChange={(val) => onChange(cssGradientProp.key, val)}
              />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// Gradient editor for background group
function GradientEditor({
  props: gradientPropsArr,
  values,
  onChange,
}: {
  props: EditableProp[];
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  const typeProp = gradientPropsArr.find((p) => p.key === "gradient-type");
  const angleProp = gradientPropsArr.find((p) => p.key === "gradient-angle");
  const dirProp = gradientPropsArr.find((p) => p.key === "gradient-direction");
  const startProp = gradientPropsArr.find((p) => p.key === "gradient-start");
  const endProp = gradientPropsArr.find((p) => p.key === "gradient-end");
  const startPosProp = gradientPropsArr.find(
    (p) => p.key === "gradient-start-position",
  );
  const endPosProp = gradientPropsArr.find((p) => p.key === "gradient-end-position");

  if (!typeProp || !startProp || !endProp) return null;

  const clamp = (raw: string, fallback: number, min: number, max: number) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const gradType = values[typeProp.key] || "none";
  const isActive = gradType !== "none" && gradType !== "";
  const startColor = values[startProp.key] || "#000000";
  const endColor = values[endProp.key] || "#ffffff";
  const startPos = clamp(values[startPosProp?.key || ""], 0, 0, 100);
  const endPos = clamp(values[endPosProp?.key || ""], 100, 0, 100);
  const angle = clamp(values[angleProp?.key || ""], 180, 0, 360);
  const legacyDir = values[dirProp?.key || ""] || "to bottom";
  const linearAxis = angleProp ? `${angle}deg` : legacyDir;

  const previewGrad =
    gradType === "radial"
      ? `radial-gradient(circle, ${startColor} ${startPos}%, ${endColor} ${endPos}%)`
      : `linear-gradient(${linearAxis}, ${startColor} ${startPos}%, ${endColor} ${endPos}%)`;

  const setType = (type: "none" | "linear" | "radial") => {
    onChange(typeProp.key, type);
  };

  return (
    <div className="space-y-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/25">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--muted-foreground)]">
          Background Type
        </span>
        <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setType("none")}
            className={`px-2 py-1 text-[10px] ${gradType === "none" ? "bg-[var(--primary)] text-white" : "bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            None
          </button>
          <button
            type="button"
            onClick={() => setType("linear")}
            className={`px-2 py-1 text-[10px] border-l border-[var(--border)] ${gradType === "linear" ? "bg-[var(--primary)] text-white" : "bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            Linear
          </button>
          <button
            type="button"
            onClick={() => setType("radial")}
            className={`px-2 py-1 text-[10px] border-l border-[var(--border)] ${gradType === "radial" ? "bg-[var(--primary)] text-white" : "bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            Radial
          </button>
        </div>
      </div>

      {isActive && (
        <>
          <div
            className="h-12 w-full rounded-md border border-[var(--border)]"
            style={{ background: previewGrad }}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-[var(--muted-foreground)] mb-1 block">
                First Color
              </span>
              <div className="flex items-center bg-[var(--input)] border border-[var(--border)] rounded-lg overflow-hidden">
                <input
                  type="color"
                  value={startColor}
                  onChange={(e) => onChange(startProp.key, e.target.value)}
                  className="w-7 h-7 cursor-pointer bg-transparent flex-shrink-0 border-none p-0.5"
                />
                <input
                  type="text"
                  value={values[startProp.key] || ""}
                  onChange={(e) => onChange(startProp.key, e.target.value)}
                  className="flex-1 bg-transparent border-none px-1 py-1.5 text-[11px] font-mono outline-none min-w-0"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div>
              <span className="text-[10px] text-[var(--muted-foreground)] mb-1 block">
                Second Color
              </span>
              <div className="flex items-center bg-[var(--input)] border border-[var(--border)] rounded-lg overflow-hidden">
                <input
                  type="color"
                  value={endColor}
                  onChange={(e) => onChange(endProp.key, e.target.value)}
                  className="w-7 h-7 cursor-pointer bg-transparent flex-shrink-0 border-none p-0.5"
                />
                <input
                  type="text"
                  value={values[endProp.key] || ""}
                  onChange={(e) => onChange(endProp.key, e.target.value)}
                  className="flex-1 bg-transparent border-none px-1 py-1.5 text-[11px] font-mono outline-none min-w-0"
                  placeholder="#ffffff"
                />
              </div>
            </div>
          </div>

          {startPosProp && (
            <div className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-[var(--muted-foreground)]">
                First Location
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={startPos}
                onChange={(e) => onChange(startPosProp.key, e.target.value)}
                className="flex-1 range-slider"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={startPos}
                onChange={(e) => onChange(startPosProp.key, e.target.value)}
                className="w-16 bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
              />
            </div>
          )}

          {endPosProp && (
            <div className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-[var(--muted-foreground)]">
                Second Location
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={endPos}
                onChange={(e) => onChange(endPosProp.key, e.target.value)}
                className="flex-1 range-slider"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={endPos}
                onChange={(e) => onChange(endPosProp.key, e.target.value)}
                className="w-16 bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
              />
            </div>
          )}

          {gradType === "linear" && angleProp && (
            <div className="flex items-center gap-2">
              <span className="w-24 text-[10px] text-[var(--muted-foreground)]">
                Angle
              </span>
              <input
                type="range"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => onChange(angleProp.key, e.target.value)}
                className="flex-1 range-slider"
              />
              <input
                type="number"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => onChange(angleProp.key, e.target.value)}
                className="w-16 bg-[var(--input)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Component props renderer with repeatable group support ---
function ComponentPropsRenderer({
  schema,
  props: compProps,
  allSchemaProps,
  onPropChange,
  onLiveStyle,
  onBrowseMedia,
  onInsertVariable,
  previewWidth,
}: {
  schema: { name?: string; repeatableGroups?: RepeatableGroup[] };
  props: Record<string, string>;
  allSchemaProps: {
    key: string;
    label: string;
    type: string;
    half?: boolean;
    repeatableGroup?: string;
    default?: string;
    placeholder?: string;
    options?: { label: string; value: string }[];
    group?: string;
    conditionalOn?: string;
    buttonSet?: 'primary' | 'secondary';
    responsive?: boolean;
    separator?: boolean;
  }[];
  onPropChange: (key: string, val: string) => void;
  onLiveStyle?: (key: string, val: string) => void;
  onBrowseMedia?: (propKey: string) => void;
  onInsertVariable?: (propKey: string, token: string) => void;
  previewWidth: 'desktop' | 'mobile';
}) {
  const groups = schema.repeatableGroups || [];

  // For numbered groups (feature{n}, stat-{n}), determine how many items have data
  const getNumberedGroupItemCount = (group: RepeatableGroup): number => {
    // Find all props for this group, grouped by item number
    const groupProps = allSchemaProps.filter(
      (p) => p.repeatableGroup === group.key,
    );
    const propsPerItem = group.propsPerItem.length;
    const totalItems = groupProps.length / propsPerItem;
    let activeCount = 0;
    for (let itemIdx = 0; itemIdx < totalItems; itemIdx++) {
      const itemProps = groupProps.slice(
        itemIdx * propsPerItem,
        (itemIdx + 1) * propsPerItem,
      );
      const hasValue = itemProps.some((p) => compProps[p.key]);
      if (hasValue) activeCount = itemIdx + 1; // Keep all up to the last filled one
    }
    return Math.max(1, activeCount); // Show at least 1
  };

  // For non-numbered groups (social links), each prop is one item
  const isNumberedGroup = (group: RepeatableGroup): boolean => {
    return group.propsPerItem.some((p) => p.includes("{n}"));
  };

  const getNonNumberedActiveItems = (group: RepeatableGroup): string[] => {
    const groupProps = allSchemaProps.filter(
      (p) => p.repeatableGroup === group.key,
    );
    return groupProps.filter((p) => compProps[p.key]).map((p) => p.key);
  };

  // Track which groups are showing how many items
  const [groupItemCounts, setGroupItemCounts] = useState<
    Record<string, number>
  >(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      if (isNumberedGroup(group)) {
        counts[group.key] = getNumberedGroupItemCount(group);
      }
    }
    return counts;
  });

  // For non-numbered groups, track visible items by key
  const [visibleNonNumbered, setVisibleNonNumbered] = useState<
    Record<string, Set<string>>
  >(() => {
    const result: Record<string, Set<string>> = {};
    for (const group of groups) {
      if (!isNumberedGroup(group)) {
        const active = getNonNumberedActiveItems(group);
        result[group.key] = new Set(active);
      }
    }
    return result;
  });

  // Render standard (non-repeatable) props with half-width grouping
  const renderStandardProps = (propsToRender: typeof allSchemaProps) => {
    const propByKey = new Map(propsToRender.map((p) => [p.key, p]));
    const getEffectivePropValue = (propKey: string) => {
      const target = propByKey.get(propKey);
      if (!target) return compProps[propKey] || "";
      const isResp = !!target.responsive;
      if (isResp && previewWidth === "mobile") {
        return compProps[`m:${propKey}`] || compProps[propKey] || target.default || "";
      }
      return compProps[propKey] || target.default || "";
    };

    // Filter out props gated by conditionalOn when the referenced prop is falsy
    const visibleProps = propsToRender.filter(p => {
      if (!p.conditionalOn) return true;
      const depVal = compProps[p.conditionalOn];
      const depProp = allSchemaProps.find((candidate) => candidate.key === p.conditionalOn);
      if (depProp?.type === "toggle") return depVal === "true";
      if (String(depVal || "").trim() === "") return false;

      return true;
    }).filter((p) => {
      // Hide border width/color controls when their matching border style is set to none.
      // This covers button border controls and simple border groups rendered via standard fields.
      if (!p.key.includes("border") || !p.key.match(/-(width|color)$/)) return true;
      const styleKey = p.key.replace(/-(width|color)$/, "-style");
      if (!propByKey.has(styleKey)) return true;
      return String(getEffectivePropValue(styleKey)).trim().toLowerCase() !== "none";
    });
    // Helper: inline types show label beside the control (small widgets)
    const isInlineType = (type: string) => type === 'select' || type === 'toggle' || type === 'color';

    const isMobile = previewWidth === 'mobile';

    // Resolve responsive prop key, value, placeholder
    const resolve = (prop: typeof allSchemaProps[0]) => {
      const isResp = !!prop.responsive;
      const effectiveKey = (isResp && isMobile) ? `m:${prop.key}` : prop.key;
      const value = compProps[effectiveKey] || '';
      const desktopVal = compProps[prop.key] || '';
      const mobilePlaceholder = desktopVal || prop.default || '';
      const hasMobileOverride = isResp && !!compProps[`m:${prop.key}`];
      // For mobile editing, override placeholder and clear default so field shows empty when no override
      const propOverride = (isResp && isMobile)
        ? { ...prop, placeholder: mobilePlaceholder, default: undefined as string | undefined }
        : prop;
      return { effectiveKey, value, hasMobileOverride, isResp, propOverride };
    };

    // Responsive indicator next to label
    const RespIndicator = ({
      isResp,
      hasMobileOverride,
    }: {
      isResp: boolean;
      hasMobileOverride: boolean;
    }) => {
      if (!isResp) return null;

      const title = isMobile
        ? "Mobile override: this edit only affects mobile"
        : hasMobileOverride
          ? "Desktop value: mobile has its own override"
          : "Desktop value: this edit affects desktop and mobile";

      return (
        <span className="inline-flex items-center ml-1" title={title}>
          {isMobile ? (
            <DevicePhoneMobileIcon className="w-3.5 h-3.5 text-[var(--primary)]" />
          ) : (
            <ComputerDesktopIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          )}
          {hasMobileOverride && !isMobile && (
            <span
              className="ml-1 w-1.5 h-1.5 rounded-full bg-[var(--primary)]"
              aria-hidden="true"
            />
          )}
        </span>
      );
    };

    // Clear mobile override button
    const ClearMobile = ({ propKey, isResp }: { propKey: string; isResp: boolean }) => {
      if (!isResp || !isMobile || !compProps[`m:${propKey}`]) return null;
      return (
        <button
          onClick={() => onPropChange(`m:${propKey}`, '')}
          className="text-[9px] text-[var(--muted-foreground)] hover:text-red-400 ml-0.5 leading-none"
          title="Clear mobile override"
        >✕</button>
      );
    };

    // Helper: generate onInsertVariable callback for eligible prop types
    const varPickerFor = (p: { type: string }, effectiveKey: string, _currentVal: string) =>
      VARIABLE_ELIGIBLE_TYPES.has(p.type) && onInsertVariable
        ? (token: string) => onInsertVariable(effectiveKey, token)
        : undefined;

    const elements: React.ReactNode[] = [];
    let i = 0;
    const pairHalfFields = false;
    while (i < visibleProps.length) {
      const prop = visibleProps[i];
      const nextProp = visibleProps[i + 1];
      const r = resolve(prop);

      // Render a visual separator line before this prop if flagged
      if (prop.separator && i > 0) {
        elements.push(
          <div key={`sep-${prop.key}`} className="border-t border-[var(--border)] pt-1" />
        );
      }

      // Keep color controls on their own row for consistent labeling/layout.
      if (
        pairHalfFields &&
        prop.half &&
        nextProp?.half &&
        prop.type !== "color" &&
        nextProp.type !== "color"
      ) {
        const rNext = resolve(nextProp);
        // Half-width pairs: keep vertical labels (label above) — compact layout
        elements.push(
          <div key={`${prop.key}-${nextProp.key}`} className="flex gap-2">
            <div className="flex-1 min-w-0">
              {prop.type === "color" ? (
                <div className="w-full flex items-center justify-between gap-2">
                  <label className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0 leading-tight whitespace-nowrap flex items-center gap-0.5">
                    {prop.label}
                    <RespIndicator isResp={r.isResp} hasMobileOverride={r.hasMobileOverride} />
                    <ClearMobile propKey={prop.key} isResp={r.isResp} />
                  </label>
                  <div className="flex-shrink-0">
                    <PropField
                      prop={r.propOverride}
                      value={r.value}
                      onChange={(val) => onPropChange(r.effectiveKey, val)}
                      onLiveStyle={
                        onLiveStyle ? (val) => onLiveStyle(prop.key, val) : undefined
                      }
                    />
                  </div>
                </div>
              ) : (
                <>
                  <label className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center">
                    {prop.label}
                    <RespIndicator isResp={r.isResp} hasMobileOverride={r.hasMobileOverride} />
                    <ClearMobile propKey={prop.key} isResp={r.isResp} />
                  </label>
                  <PropField
                    prop={r.propOverride}
                    value={r.value}
                    onChange={(val) => onPropChange(r.effectiveKey, val)}
                    onLiveStyle={
                      onLiveStyle ? (val) => onLiveStyle(prop.key, val) : undefined
                    }
                    onBrowseMedia={
                      prop.type === "image" && onBrowseMedia
                        ? () => onBrowseMedia(prop.key)
                        : undefined
                    }
                    onInsertVariable={varPickerFor(prop, r.effectiveKey, r.value)}
                  />
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {nextProp.type === "color" ? (
                <div className="w-full flex items-center justify-between gap-2">
                  <label className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0 leading-tight whitespace-nowrap flex items-center gap-0.5">
                    {nextProp.label}
                    <RespIndicator isResp={rNext.isResp} hasMobileOverride={rNext.hasMobileOverride} />
                    <ClearMobile propKey={nextProp.key} isResp={rNext.isResp} />
                  </label>
                  <div className="flex-shrink-0">
                    <PropField
                      prop={rNext.propOverride}
                      value={rNext.value}
                      onChange={(val) => onPropChange(rNext.effectiveKey, val)}
                      onLiveStyle={
                        onLiveStyle
                          ? (val) => onLiveStyle(nextProp.key, val)
                          : undefined
                      }
                    />
                  </div>
                </div>
              ) : (
                <>
                  <label className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center">
                    {nextProp.label}
                    <RespIndicator isResp={rNext.isResp} hasMobileOverride={rNext.hasMobileOverride} />
                    <ClearMobile propKey={nextProp.key} isResp={rNext.isResp} />
                  </label>
                  <PropField
                    prop={rNext.propOverride}
                    value={rNext.value}
                    onChange={(val) => onPropChange(rNext.effectiveKey, val)}
                    onLiveStyle={
                      onLiveStyle
                        ? (val) => onLiveStyle(nextProp.key, val)
                        : undefined
                    }
                    onBrowseMedia={
                      nextProp.type === "image" && onBrowseMedia
                        ? () => onBrowseMedia(nextProp.key)
                        : undefined
                    }
                    onInsertVariable={varPickerFor(nextProp, rNext.effectiveKey, rNext.value)}
                  />
                </>
              )}
            </div>
          </div>,
        );
        i += 2;
      } else if (isInlineType(prop.type)) {
        // Inline: horizontal layout (label left, control right) — small controls only
        elements.push(
          <div key={prop.key} className="w-full flex items-center justify-between gap-3">
            <label className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0 leading-tight whitespace-nowrap flex items-center gap-0.5">
              {prop.label}
              <RespIndicator isResp={r.isResp} hasMobileOverride={r.hasMobileOverride} />
              <ClearMobile propKey={prop.key} isResp={r.isResp} />
            </label>
            <div className="flex-shrink-0">
              <PropField
                prop={r.propOverride}
                value={r.value}
                onChange={(val) => onPropChange(r.effectiveKey, val)}
                onLiveStyle={
                  onLiveStyle ? (val) => onLiveStyle(prop.key, val) : undefined
                }
              />
            </div>
          </div>,
        );
        i += 1;
      } else {
        // Vertical: label above, full-width control — text, unit, padding, radius, image, etc.
        elements.push(
          <div key={prop.key}>
            <label className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center">
              {prop.label}
              <RespIndicator isResp={r.isResp} hasMobileOverride={r.hasMobileOverride} />
              <ClearMobile propKey={prop.key} isResp={r.isResp} />
            </label>
            <PropField
              prop={r.propOverride}
              value={r.value}
              onChange={(val) => onPropChange(r.effectiveKey, val)}
              onLiveStyle={
                onLiveStyle ? (val) => onLiveStyle(prop.key, val) : undefined
              }
              onBrowseMedia={
                prop.type === "image" && onBrowseMedia
                  ? () => onBrowseMedia(prop.key)
                  : undefined
              }
              onInsertVariable={varPickerFor(prop, r.effectiveKey, r.value)}
            />
          </div>,
        );
        i += 1;
      }
    }
    return elements;
  };

  // Render a numbered repeatable group (features, stats)
  const renderNumberedGroup = (group: RepeatableGroup) => {
    const groupProps = allSchemaProps.filter(
      (p) => p.repeatableGroup === group.key,
    );
    const propsPerItem = group.propsPerItem.length;
    const totalItems = groupProps.length / propsPerItem;
    const visibleCount = groupItemCounts[group.key] || 1;

    return (
      <div key={`group-${group.key}`} className="space-y-2">
        {Array.from({ length: visibleCount }, (_, itemIdx) => {
          const itemProps = groupProps.slice(
            itemIdx * propsPerItem,
            (itemIdx + 1) * propsPerItem,
          );
          return (
            <div
              key={`${group.key}-${itemIdx}`}
              className="border border-[var(--border)] rounded-lg p-2.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  {group.label} {itemIdx + 1}
                </span>
                {visibleCount > 1 && (
                  <button
                    onClick={() => {
                      // Clear this item's props and remove it
                      for (const p of itemProps) {
                        onPropChange(p.key, "");
                      }
                      setGroupItemCounts((prev) => ({
                        ...prev,
                        [group.key]: Math.max(1, prev[group.key] - 1),
                      }));
                    }}
                    className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                    title={`Remove ${group.label} ${itemIdx + 1}`}
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {renderStandardProps(itemProps)}
            </div>
          );
        })}
        {visibleCount < totalItems && (
          <button
            onClick={() =>
              setGroupItemCounts((prev) => ({
                ...prev,
                [group.key]: Math.min(totalItems, (prev[group.key] || 1) + 1),
              }))
            }
            className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add {group.label}
          </button>
        )}
      </div>
    );
  };

  // Render a non-numbered repeatable group (social links)
  const renderNonNumberedGroup = (group: RepeatableGroup) => {
    const groupProps = allSchemaProps.filter(
      (p) => p.repeatableGroup === group.key,
    );
    const visible = visibleNonNumbered[group.key] || new Set<string>();
    const visibleProps = groupProps.filter((p) => visible.has(p.key));
    const hiddenProps = groupProps.filter((p) => !visible.has(p.key));

    return (
      <div key={`group-${group.key}`} className="space-y-2">
        {visibleProps.length > 0 &&
          visibleProps.map((prop) => (
            <div key={prop.key} className="flex items-end gap-1.5">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                  {prop.label}
                </label>
                <PropField
                  prop={prop}
                  value={compProps[prop.key] || ""}
                  onChange={(val) => onPropChange(prop.key, val)}
                  onInsertVariable={
                    VARIABLE_ELIGIBLE_TYPES.has(prop.type) && onInsertVariable
                      ? (token: string) => onInsertVariable(prop.key, token)
                      : undefined
                  }
                />
              </div>
              <button
                onClick={() => {
                  onPropChange(prop.key, "");
                  setVisibleNonNumbered((prev) => {
                    const next = new Set(prev[group.key]);
                    next.delete(prop.key);
                    return { ...prev, [group.key]: next };
                  });
                }}
                className="p-1.5 mb-0.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                title={`Remove ${prop.label}`}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        {hiddenProps.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setVisibleNonNumbered((prev) => {
                  const next = new Set(prev[group.key]);
                  next.add(e.target.value);
                  return { ...prev, [group.key]: next };
                });
              }}
              className="w-full py-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--muted-foreground)] hover:border-[var(--primary)] transition-colors bg-transparent text-center cursor-pointer appearance-none"
            >
              <option value="">+ Add {group.label}</option>
              {hiddenProps.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };

  // ── Group-based section building ──

  // State for collapsible groups and smart defaults
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [buttonSetTab, setButtonSetTab] = useState<'primary' | 'secondary'>('primary');
  const [trackingSetTab, setTrackingSetTab] = useState<'primary' | 'secondary'>('primary');
  // Separate repeatable-group props from standard props
  const standardProps = allSchemaProps.filter(p => !p.repeatableGroup);
  const renderedRepeatableGroups = new Set<string>();

  // Group standard props by their group value
  const propsByGroup: Record<string, typeof standardProps> = {};
  for (const prop of standardProps) {
    const g = prop.group || 'text';
    if (!propsByGroup[g]) propsByGroup[g] = [];
    propsByGroup[g].push(prop);
  }

  // Sort groups by configured order
  const sortedGroupNames = Object.keys(propsByGroup).sort(
    (a, b) => (GROUP_CONFIG[a]?.order ?? 99) - (GROUP_CONFIG[b]?.order ?? 99)
  );

  // Check if a group has gradient props
  const hasGradientProps = (gProps: typeof standardProps) =>
    gProps.some(p => p.key === 'gradient-type');

  // Separate gradient props from regular props in a group
  const splitGradientProps = (gProps: typeof standardProps) => {
    const gradientKeys = [
      "gradient-type",
      "gradient-angle",
      "gradient-direction",
      "gradient-start",
      "gradient-start-position",
      "gradient-end",
      "gradient-end-position",
    ];
    return {
      regular: gProps.filter(p => !gradientKeys.includes(p.key)),
      gradient: gProps.filter(p => gradientKeys.includes(p.key)),
    };
  };

  const sections: React.ReactNode[] = [];

  // Render grouped standard props
  for (const groupName of sortedGroupNames) {
    const groupProps = propsByGroup[groupName];
    const config = GROUP_CONFIG[groupName];
    const groupLabel =
      schema.name === "header" && groupName === "background"
        ? "Logo & Background"
        : (config?.label || groupName);
    const isOpen = expandedGroups[groupName] ?? false;
    // Check if this group has button sets (primary/secondary tabs)
    const hasButtonSets = groupProps.some(p => p.buttonSet);

    sections.push(
      <CollapsiblePropGroup
        key={`group-${groupName}`}
        label={groupLabel}
        isOpen={isOpen}
        onToggle={() => setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
      >
        {groupName === 'border' ? (
          // Border group: custom per-side editor, with fallback to standard rendering
          (() => {
            const hasPerSide = groupProps.some(p => p.key.match(/-(top|right|bottom|left)-/));
            if (hasPerSide) {
              return (
                <BorderSideEditor
                  props={groupProps}
                  values={compProps}
                  onChange={onPropChange}
                  onLiveStyle={onLiveStyle ? (key, val) => onLiveStyle(key, val) : undefined}
                />
              );
            }
            // Fallback: render border props as standard fields (divider, footer)
            return <>{renderStandardProps(groupProps)}</>;
          })()
        ) : hasButtonSets ? (
          // Button/tracking groups with primary/secondary tabs
          (() => {
            const isHeroTrackingGroup = groupName === "tracking" && schema.name === "hero";
            const hasSecondaryButton = String(compProps["secondary-button-text"] || "").trim() !== "";
            const trackingTabs = hasSecondaryButton
              ? (["primary", "secondary"] as ("primary" | "secondary")[])
              : (["primary"] as ("primary" | "secondary")[]);

            if (isHeroTrackingGroup) {
              return (
                <ButtonSetTabs
                  groupProps={groupProps}
                  activeTab={trackingSetTab}
                  onTabChange={setTrackingSetTab}
                  renderStandardProps={renderStandardProps}
                  tabs={trackingTabs}
                  hideTabsWhenSingle
                />
              );
            }

            return (
              <ButtonSetTabs
                groupProps={groupProps}
                activeTab={buttonSetTab}
                onTabChange={setButtonSetTab}
                renderStandardProps={renderStandardProps}
              />
            );
          })()
        ) : (() => {
          // For background group, check for gradient props
          const isBackgroundGroup = groupName === 'background';
          const isHeroBackground = isBackgroundGroup && schema.name === "hero";
          const hasGradient = isBackgroundGroup && hasGradientProps(groupProps);
          const { regular: regularProps, gradient: gradientPropsList } = hasGradient
            ? splitGradientProps(groupProps)
            : { regular: groupProps, gradient: [] as typeof groupProps };

          if (isHeroBackground) {
            return (
              <HeroBackgroundEditor
                props={groupProps}
                values={compProps}
                onChange={onPropChange}
                onBrowseMedia={onBrowseMedia}
                previewWidth={previewWidth}
              />
            );
          }

          return (
            <>
              {renderStandardProps(regularProps)}
              {hasGradient && gradientPropsList.length > 0 && (
                <GradientEditor
                  props={gradientPropsList}
                  values={compProps}
                  onChange={onPropChange}
                />
              )}
            </>
          );
        })()}
      </CollapsiblePropGroup>
    );
  }

  // Render repeatable groups after standard groups
  for (const prop of allSchemaProps) {
    if (prop.repeatableGroup && !renderedRepeatableGroups.has(prop.repeatableGroup)) {
      renderedRepeatableGroups.add(prop.repeatableGroup);
      const group = groups.find((g) => g.key === prop.repeatableGroup);
      if (group) {
        if (isNumberedGroup(group)) {
          sections.push(renderNumberedGroup(group));
        } else {
          sections.push(renderNonNumberedGroup(group));
        }
      }
    }
  }

  return <div className="[&>*:first-child]:border-t-0">{sections}</div>;
}

// Settings field definition type
interface SettingsField {
  key: string;
  label: string;
  type: string;
  target: string;
  placeholder?: string;
  half?: boolean;
}

interface SettingsSection {
  label: string;
  key: string;
  fields: SettingsField[];
}

// Canonical CTA prop keys used by x-core.cta + legacy aliases found in older templates.
const CTA_PROP_ALIASES: Record<string, string[]> = {
  "button-bg-color": ["bg-color"],
  "button-text-color": ["text-color"],
  "button-radius": ["radius"],
  "button-padding": ["padding"],
};

// Canonical global button keys mapped onto Hero primary/secondary button props.
const HERO_BUTTON_PROP_MAP: Record<string, string[]> = {
  "button-bg-color": [
    "primary-button-bg-color",
    "secondary-button-bg-color",
  ],
  "button-text-color": [
    "primary-button-text-color",
    "secondary-button-text-color",
  ],
  "button-radius": ["primary-button-radius", "secondary-button-radius"],
  "button-padding": ["primary-button-padding", "secondary-button-padding"],
};

// Settings sections with static defaults (no theme system)
const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: "Email Meta",
    key: "meta",
    fields: [
      { key: "fm:title", label: "Title", type: "text", target: "frontmatter" },
    ],
  },
  {
    label: "Layout",
    key: "layout",
    fields: [
      {
        key: "content-margin",
        label: "Margin",
        type: "padding",
        target: "baseProps",
        placeholder: "0px",
      },
      {
        key: "content-padding",
        label: "Padding",
        type: "padding",
        target: "baseProps",
        placeholder: "50px",
      },
      {
        key: "content-radius",
        label: "Border Radius",
        type: "radius",
        target: "baseProps",
        placeholder: "0",
      },
    ],
  },
  {
    label: "Colors",
    key: "colors",
    fields: [
      {
        key: "body-bg",
        label: "Body BG",
        type: "color",
        target: "baseProps",
        placeholder: "#ffffff",
        half: true,
      },
      {
        key: "content-bg",
        label: "Content BG",
        type: "color",
        target: "baseProps",
        placeholder: "#ffffff",
        half: true,
      },
    ],
  },
  {
    label: "CTA Button",
    key: "cta",
    fields: [
      {
        key: "button-bg-color",
        label: "Button Color",
        type: "color",
        target: "ctaComponents",
        placeholder: "#000000",
        half: true,
      },
      {
        key: "button-text-color",
        label: "Text Color",
        type: "color",
        target: "ctaComponents",
        placeholder: "#ffffff",
        half: true,
      },
      {
        key: "button-radius",
        label: "Button Radius",
        type: "radius",
        target: "ctaComponents",
        placeholder: "0",
      },
      {
        key: "button-padding",
        label: "Button Padding",
        type: "padding",
        target: "ctaComponents",
        placeholder: "18px 48px",
      },
    ],
  },
];

// Helper to serialize a single component into lines
function serializeComponent(
  comp: { type: string; props: Record<string, string>; content?: string },
  indent: string,
): string[] {
  const lines: string[] = [];
  const propEntries = Object.entries(comp.props);
  if (propEntries.length <= 2) {
    const attrStr = propEntries.map(([k, v]) => `${k}="${v}"`).join(" ");
    if (comp.content) {
      lines.push(
        `${indent}<x-core.${comp.type} ${attrStr}>${comp.content}</x-core.${comp.type}>`,
      );
    } else {
      lines.push(`${indent}<x-core.${comp.type} ${attrStr} />`);
    }
  } else {
    lines.push(`${indent}<x-core.${comp.type}`);
    for (const [key, value] of propEntries) {
      lines.push(`${indent}  ${key}="${value}"`);
    }
    if (comp.content) {
      lines[lines.length - 1] += ">";
      lines.push(`${indent}  ${comp.content}`);
      lines.push(`${indent}</x-core.${comp.type}>`);
    } else {
      lines.push(`${indent}/>`);
    }
  }
  return lines;
}

// All footer component types (only one allowed per template)
const FOOTER_TYPES = new Set(["footer"]);

// ── Live style injection ──
// Maps component prop names to CSS properties for instant preview updates.
// Only covers props that are simple, direct CSS mappings (color, background-color, padding, etc.)
// Composed/computed props (border shorthand, gradients) still go through the full compile.
const PROP_CSS_MAP: Record<string, string> = {
  // Colors
  "bg-color": "background-color",
  "text-color": "color",
  "link-color": "color",
  "dealer-name-color": "color",
  "phone-color": "color",
  "divider-color": "background-color",
  "icon-color": "color",
  "copyright-color": "color",
  "card-background": "background-color",
  "card-bg-color": "background-color",
  "eyebrow-color": "color",
  "headline-color": "color",
  "subheadline-color": "color",
  "body-color": "color",
  "greeting-color": "color",
  "label-color": "color",
  "value-color": "color",
  "caption-color": "color",
  "quote-color": "color",
  "author-color": "color",
  "source-color": "color",
  "vehicle-color": "color",
  "stat-label-color": "color",
  "stat-value-color": "color",
  "cta-color": "color",
  "description-color": "color",
  "heading-color": "color",
  "disclaimer-color": "color",
  "title-color": "color",
  "image-text-color": "color",
  "image-desc-color": "color",
  "primary-bg-color": "background-color",
  "primary-text-color": "color",
  "secondary-bg-color": "background-color",
  "secondary-text-color": "color",
  "button-bg-color": "background-color",
  "button-text-color": "color",
  "button-padding": "padding",
  // Spacing / sizing
  padding: "padding",
  "container-padding": "padding",
  "content-padding": "padding",
  "card-padding": "padding",
  "outer-padding": "padding",
  "brand-padding": "padding",
  // Font
  "font-size": "font-size",
  "greeting-size": "font-size",
  "body-size": "font-size",
  "headline-size": "font-size",
  "subheadline-size": "font-size",
  "eyebrow-size": "font-size",
  "label-size": "font-size",
  "value-size": "font-size",
  "quote-size": "font-size",
  "vehicle-size": "font-size",
  // Radius
  radius: "border-radius",
  "card-radius": "border-radius",
  "primary-radius": "border-radius",
  "secondary-radius": "border-radius",
  "button-radius": "border-radius",
};

// Inject a live style change directly into the iframe DOM, bypassing the Maizzle compiler.
// Finds all elements within a component's <tr> subtree that currently have the target CSS
// property set, and updates their value. Falls back to the component's main <td> if needed.
function injectLiveStyle(
  iframe: HTMLIFrameElement | null,
  componentIndex: number,
  cssProp: string,
  value: string,
) {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Find all <tr> elements for this component
    const trs = doc.querySelectorAll(`tr[data-loomi="${componentIndex}"]`);
    if (trs.length === 0) return;

    // Search within the component subtree for elements that already have this style set
    let found = false;
    trs.forEach((tr) => {
      const all = tr.querySelectorAll("*");
      all.forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style && htmlEl.style.getPropertyValue(cssProp)) {
          htmlEl.style.setProperty(cssProp, value);
          found = true;
        }
      });
      // Also check the <tr> itself
      const trEl = tr as HTMLElement;
      if (trEl.style && trEl.style.getPropertyValue(cssProp)) {
        trEl.style.setProperty(cssProp, value);
        found = true;
      }
    });

    // If no element found with that property, try the first <td> child (common case for bg-color)
    if (!found && trs.length > 0) {
      const td = trs[0].querySelector(":scope > td") as HTMLElement;
      if (td) {
        td.style.setProperty(cssProp, value);
      }
    }
  } catch {
    // iframe cross-origin or other error, silently fail
  }
}

// Inject a live style for base layout props (body-bg, content-bg) which are on wrapper elements
function injectLiveBaseStyle(
  iframe: HTMLIFrameElement | null,
  propKey: string,
  value: string,
) {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;

    if (propKey === "body-bg") {
      // Body background + outer table
      if (doc.body) doc.body.style.backgroundColor = value;
      const outerTable = doc.querySelector(
        'table[role="presentation"]',
      ) as HTMLElement;
      if (outerTable) outerTable.style.backgroundColor = value;
    } else if (propKey === "content-bg") {
      // Inner content table
      const contentTable = doc.querySelector(".email-container") as HTMLElement;
      if (contentTable) contentTable.style.backgroundColor = value;
    }
  } catch {
    // silently fail
  }
}

// Preview serializer — injects hidden div markers for click-to-select
// Uses <div data-loomi="N" style="display:none"> because Maizzle/PostHTML strips HTML comments
function serializeTemplateForPreview(
  template: ParsedTemplate,
  hiddenComponents: Set<number>,
): string {
  const lines: string[] = [];
  lines.push("---");
  for (const [key, value] of Object.entries(template.frontmatter)) {
    if (
      typeof value === "string" &&
      (value.includes(":") || value.includes("{") || value.includes('"'))
    ) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  lines.push("");
  if (Object.keys(template.baseProps).length <= 2) {
    const inlineStr = Object.entries(template.baseProps)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    lines.push(`<x-base ${inlineStr}>`);
  } else {
    lines.push(`<x-base`);
    for (const [k, v] of Object.entries(template.baseProps)) {
      lines.push(`  ${k}="${v}"`);
    }
    lines.push(`>`);
  }

  // Build indexed component list preserving original indices
  template.components.forEach((comp, i) => {
    if (hiddenComponents.has(i)) return;
    const compWithIndex = {
      ...comp,
      props: { ...comp.props, "component-index": String(i) },
    };
    lines.push("");
    lines.push(`  <div data-loomi="${i}" style="display:none"></div>`);
    lines.push(...serializeComponent(compWithIndex, "  "));
  });
  lines.push(`  <div data-loomi="end" style="display:none"></div>`);

  lines.push("");
  lines.push("</x-base>");
  lines.push("");
  return lines.join("\n");
}

// Post-process compiled HTML to convert hidden div markers into data-loomi attributes on <tr> elements
function injectLoomiAttributes(html: string): string {
  // Find all <div data-loomi="N" ...> markers
  const markerRegex = /<div data-loomi="(\d+|end)"[^>]*><\/div>/gi;
  const markers: { id: string; start: number; end: number }[] = [];
  let match;
  while ((match = markerRegex.exec(html)) !== null) {
    markers.push({
      id: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (markers.length === 0) return html;

  // Process sections between consecutive markers in reverse order to preserve positions
  let result = html;
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    if (marker.id === "end") {
      // Remove end markers
      result = result.slice(0, marker.start) + result.slice(marker.end);
      continue;
    }

    const sectionStart = marker.end;
    const nextMarker = markers[i + 1];
    const sectionEnd = nextMarker ? nextMarker.start : result.length;

    // Inject data-loomi into all <tr tags within this section
    const section = result.slice(sectionStart, sectionEnd);
    const modified = section.replace(
      /<tr(\s|>)/gi,
      `<tr data-loomi="${marker.id}"$1`,
    );

    // Replace section with annotated version and remove the marker div
    result =
      result.slice(0, marker.start) + modified + result.slice(sectionEnd);
  }

  return result;
}

// Client-side serializer
function serializeTemplateClient(template: ParsedTemplate): string {
  const lines: string[] = [];
  lines.push("---");
  for (const [key, value] of Object.entries(template.frontmatter)) {
    if (
      typeof value === "string" &&
      (value.includes(":") || value.includes("{") || value.includes('"'))
    ) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  lines.push("");
  if (Object.keys(template.baseProps).length <= 2) {
    const inlineStr = Object.entries(template.baseProps)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    lines.push(`<x-base ${inlineStr}>`);
  } else {
    lines.push(`<x-base`);
    for (const [k, v] of Object.entries(template.baseProps)) {
      lines.push(`  ${k}="${v}"`);
    }
    lines.push(`>`);
  }

  template.components.forEach((comp, i) => {
    const compWithIndex = {
      ...comp,
      props: { ...comp.props, "component-index": String(i) },
    };
    lines.push("");
    lines.push(...serializeComponent(compWithIndex, "  "));
  });

  lines.push("");
  lines.push("</x-base>");
  lines.push("");
  return lines.join("\n");
}

export default function TemplateEditorPage() {
  const searchParams = useSearchParams();
  const designParam = searchParams.get("design") || "";
  const [design, setDesign] = useState(designParam);
  const templateName = "template";
  const espTemplateId = searchParams.get("id") || "";
  const modeParam = searchParams.get("mode");
  const accountKeyParam = searchParams.get("accountKey") || "";
  const libraryTemplateSlug = searchParams.get("libraryTemplate") || "";
  const { isAdmin, isAccount, accountKey, accountData, accounts } = useAccount();
  const { markClean, markDirty } = useUnsavedChanges();
  const effectiveAccountKey = accountKeyParam || accountKey;
  const effectiveAccountData = useMemo(
    () => (effectiveAccountKey ? accounts[effectiveAccountKey] || null : accountData),
    [effectiveAccountKey, accounts, accountData],
  );
  const mediaPickerAccountKey = effectiveAccountKey || undefined;
  const canBrowseMedia = Boolean(mediaPickerAccountKey || isAdmin);
  const builderMode = searchParams.get("builder");
  const isHtmlOnlyBuilder = builderMode === "html";

  // ESP template mode: we're editing an EspTemplate record (not a library template)
  const [espMode, setEspMode] = useState(false);
  const [espRecordId, setEspRecordId] = useState<string | null>(null);
  const [espTemplateName, setEspTemplateName] = useState("");
  const [espSubject, setEspSubject] = useState("");
  const [espPreviewText, setEspPreviewText] = useState("");

  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
  // Ref tracks the latest parsed state so that multiple synchronous
  // updateComponentProp calls (e.g. border editor setting shorthand + 4 sides)
  // each build on the previous call's result instead of a stale closure value.
  const parsedRef = useRef<ParsedTemplate | null>(null);
  useEffect(() => { parsedRef.current = parsed; }, [parsed]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewKeyRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>(
    isHtmlOnlyBuilder ? "code" : "visual",
  );
  const [visualTab, setVisualTab] = useState<VisualTab>("components");
  const [expandedComponents, setExpandedComponents] = useState<Set<number>>(
    new Set(),
  );
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [previewContacts, setPreviewContacts] = useState<PreviewContact[]>([]);
  const [previewContactsLoading, setPreviewContactsLoading] = useState(false);
  const [previewContactsError, setPreviewContactsError] = useState("");
  const [selectedPreviewContactId, setSelectedPreviewContactId] =
    useState("__sample__");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [aiMetaLoading, setAiMetaLoading] = useState(false);
  const [aiMetaField, setAiMetaField] = useState<"subject" | "previewText" | null>(null);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [, setAiReply] = useState("");
  const [, setAiSuggestions] = useState<string[]>([]);
  const [, setAiComponentEdits] = useState<
    AssistantComponentEdit[]
  >([]);
  const [copiedSuggestion, setCopiedSuggestion] = useState("");
  const [aiHistory, setAiHistory] = useState<
    Array<{
      role: "user" | "assistant";
      content: string;
      suggestions?: string[];
      componentEdits?: AssistantComponentEdit[];
    }>
  >([]);
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<
    TemplateHistoryVersion[]
  >([]);
  const [historyCompareLoading, setHistoryCompareLoading] = useState(false);
  const [selectedHistoryVersion, setSelectedHistoryVersion] =
    useState<TemplateHistoryVersion | null>(null);
  const [selectedHistoryRaw, setSelectedHistoryRaw] = useState("");
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(
    null,
  );
  const [sectionTags, setSectionTags] = useState<{
    tags: string[];
    assignments: Record<string, string[]>;
  } | null>(null);
  const [pickerTag, setPickerTag] = useState<string>("all");
  const [hiddenComponents, setHiddenComponents] = useState<Set<number>>(
    new Set(),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragHeightsRef = useRef<number[]>([]);
  const dragTopsRef = useRef<number[]>([]);
  const dragMouseTargetRef = useRef<HTMLElement | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<number | null>(
    null,
  );
  const selectedComponentRef = useRef<number | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Media picker state
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerComponentIdx, setMediaPickerComponentIdx] = useState<number | null>(null);
  const [mediaPickerPropKey, setMediaPickerPropKey] = useState<string | null>(null);

  const handleBrowseMedia = useCallback((componentIdx: number, propKey: string) => {
    if (!canBrowseMedia) {
      toast.error("Select an account to browse media");
      return;
    }
    setMediaPickerComponentIdx(componentIdx);
    setMediaPickerPropKey(propKey);
    setMediaPickerOpen(true);
  }, [canBrowseMedia]);

  const handleMediaSelect = useCallback((url: string) => {
    if (mediaPickerComponentIdx !== null && mediaPickerPropKey) {
      updateComponentProp(mediaPickerComponentIdx, mediaPickerPropKey, url);
    }
    setMediaPickerOpen(false);
    setMediaPickerComponentIdx(null);
    setMediaPickerPropKey(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPickerComponentIdx, mediaPickerPropKey]);

  // Undo/redo history
  const historyRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const historySkipRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback((prevCode: string) => {
    historyRef.current.push(prevCode);
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const selectedPreviewContact = useMemo(
    () =>
      previewContacts.find((c) => c.id === selectedPreviewContactId) || null,
    [previewContacts, selectedPreviewContactId],
  );

  const previewVariableMap = useMemo(
    () => buildPreviewVariableMap(effectiveAccountData, selectedPreviewContact),
    [effectiveAccountData, selectedPreviewContact],
  );

  const missingPreviewVars = useMemo(
    () => findMissingPreviewVariables(code, previewVariableMap),
    [code, previewVariableMap],
  );

  const [showMissingVars, setShowMissingVars] = useState(false);

  const selectedEditorComponent = useMemo(() => {
    if (selectedComponent === null || !parsed) return null;
    const component = parsed.components[selectedComponent];
    if (!component) return null;
    const schema = componentSchemas[component.type];
    return {
      index: selectedComponent,
      type: component.type,
      label: schema?.label || component.type,
      props: component.props,
      availableProps:
        schema?.props.map((prop) => ({
          key: prop.key,
          label: prop.label,
          type: prop.type,
        })) || [],
    };
  }, [selectedComponent, parsed]);

  const compilePreview = useCallback(
    async (html: string) => {
      // Cancel any in-flight preview request
      if (previewAbortRef.current) previewAbortRef.current.abort();
      const controller = new AbortController();
      previewAbortRef.current = controller;

      setPreviewLoading(true);
      setPreviewError("");
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html,
            project: "core",
            previewValues: previewVariableMap,
          }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const data = await res.json();
        if (data.html) {
          previewKeyRef.current += 1;
          setPreviewHtml(injectLoomiAttributes(data.html));
        } else if (data.error) setPreviewError(data.error);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setPreviewError(err.message || "Preview failed");
      }
      if (!controller.signal.aborted) setPreviewLoading(false);
    },
    [previewVariableMap],
  );

  const loadPreviewContacts = useCallback(async () => {
    if (!effectiveAccountKey) {
      setPreviewContacts([]);
      setPreviewContactsError("");
      setSelectedPreviewContactId("__sample__");
      return;
    }

    setPreviewContactsLoading(true);
    setPreviewContactsError("");
    try {
      const res = await fetch(
        `/api/esp/contacts?accountKey=${encodeURIComponent(effectiveAccountKey)}&limit=30`,
      );
      const data = await res.json();
      if (!res.ok) {
        setPreviewContacts([]);
        setPreviewContactsError(data.error || "Unable to load contacts");
        return;
      }
      const contacts = Array.isArray(data.contacts)
        ? (data.contacts as PreviewContact[])
        : [];
      setPreviewContacts(contacts);
      setSelectedPreviewContactId((prev) => {
        if (prev !== "__sample__" && !contacts.some((c) => c.id === prev))
          return "__sample__";
        return prev;
      });
    } catch {
      setPreviewContacts([]);
      setPreviewContactsError("Unable to load contacts");
    } finally {
      setPreviewContactsLoading(false);
    }
  }, [effectiveAccountKey]);

  const loadTemplateHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/templates/history?design=${encodeURIComponent(design)}&type=${encodeURIComponent(templateName)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to load history");
        return;
      }
      setHistoryVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch {
      setMessage("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [design, templateName]);

  const loadHistoryVersion = useCallback(
    async (version: TemplateHistoryVersion) => {
      setHistoryCompareLoading(true);
      setSelectedHistoryVersion(version);
      setSelectedHistoryRaw("");
      try {
        const res = await fetch(
          `/api/templates/history?design=${encodeURIComponent(design)}&type=${encodeURIComponent(templateName)}&versionId=${encodeURIComponent(version.id)}`,
        );
        const data = await res.json();
        if (!res.ok || !data.raw) {
          setSelectedHistoryRaw("");
          setMessage(data.error || "Failed to load version");
          return;
        }
        setSelectedHistoryRaw(data.raw);
      } catch {
        setSelectedHistoryRaw("");
        setMessage("Failed to load version");
      } finally {
        setHistoryCompareLoading(false);
      }
    },
    [design, templateName],
  );

  const handleOpenHistory = useCallback(() => {
    setShowHistory(true);
    setSelectedHistoryVersion(null);
    setSelectedHistoryRaw("");
    loadTemplateHistory();
  }, [loadTemplateHistory]);

  // Load template + ESP variables
  useEffect(() => {
    // ── ESP template: load by ID ──
    if (espTemplateId) {
      setEspMode(true);
      setEspRecordId(espTemplateId);
      fetch(`/api/esp/templates/${espTemplateId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { console.error(data.error); return; }
          const t = data.template;
          setEspSubject(t.subject || "");
          setEspPreviewText(t.previewText || "");
          const raw = t.source || t.html || "";
          setCode(raw);
          setOriginalCode(raw);
          // Prefer frontmatter title over DB name for display
          const parsedRaw = parseTemplate(raw);
          const fmTitle = parsedRaw?.frontmatter?.title;
          setEspTemplateName(fmTitle || t.name || "");
          if (t.editorType === "code" || !t.source) {
            setEditorMode("code");
            compilePreview(raw);
          } else {
            if (parsedRaw?.frontmatter) {
              setParsed(parsedRaw);
              compilePreview(serializeTemplateForPreview(parsedRaw, new Set()));
            } else {
              compilePreview(raw);
            }
          }
        })
        .catch((err) => console.error("Error loading ESP template:", err));
      return;
    }

    // ── New ESP template (no ID yet) ──
    if (accountKeyParam && !design) {
      setEspMode(true);
      if (modeParam === "code") setEditorMode("code");
      // If starting from a library template, load its source
      if (libraryTemplateSlug) {
        fetch(`/api/templates?design=${libraryTemplateSlug}&type=template&format=raw`)
          .then((r) => r.json())
          .then((rawData) => {
            if (rawData.raw) {
              setCode(rawData.raw);
              setOriginalCode(rawData.raw);
              const p = parseTemplate(rawData.raw);
              if (p?.frontmatter) {
                setParsed(p);
                compilePreview(serializeTemplateForPreview(p, new Set()));
              } else {
                compilePreview(rawData.raw);
              }
            }
          })
          .catch((err) => console.error("Error loading library template:", err));
      } else {
        // Brand new blank ESP template — initialize with minimal structure
        const blank = `---\ntitle: Untitled Template\nrooftop: preview\n---\n\n<x-base>\n\n  <x-core.spacer size="40" />\n\n  <x-core.copy\n    greeting="Hello,"\n    body="Start building your email by adding components."\n  />\n\n  <x-core.spacer size="40" />\n\n</x-base>\n`;
        setCode(blank);
        setOriginalCode(blank);
        setEspTemplateName("Untitled Template");
        const p = parseTemplate(blank);
        if (p?.frontmatter) {
          setParsed(p);
          compilePreview(serializeTemplateForPreview(p, new Set()));
        } else {
          compilePreview(blank);
        }
      }
      return;
    }

    // ── Library template: load by design slug ──
    if (!design) return;
    Promise.all([
      fetch(
        `/api/templates?design=${design}&type=${templateName}&format=raw`,
      ).then((r) => r.json()),
      fetch(`/api/templates?design=${design}&type=${templateName}`).then((r) =>
        r.json(),
      ),
    ])
      .then(([rawData, parsedData]) => {
        if (rawData.raw) {
          setCode(rawData.raw);
          setOriginalCode(rawData.raw);
        }
        if (parsedData.frontmatter) {
          setParsed(parsedData);
          const previewCode = serializeTemplateForPreview(
            parsedData,
            new Set(),
          );
          compilePreview(previewCode);
        } else if (rawData.raw) {
          compilePreview(rawData.raw);
        }
      })
      .catch((err) => console.error("Error loading template:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, templateName, espTemplateId, accountKeyParam, libraryTemplateSlug]);

  useEffect(() => {
    setHasChanges(code !== originalCode);
  }, [code, originalCode]);

  useEffect(() => {
    if (hasChanges) {
      markDirty();
      return;
    }
    markClean();
  }, [hasChanges, markClean, markDirty]);

  // ── Auto-save (3s after last change) ──
  useEffect(() => {
    if (code === originalCode || saving) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setMessage("");
      try {
        if (espMode && espRecordId) {
          // Save to ESP template record
          const res = await fetch(`/api/esp/templates/${espRecordId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: espTemplateName || undefined,
              subject: espSubject || undefined,
              previewText: espPreviewText || undefined,
              source: code,
              html: previewHtml || undefined,
              editorType: editorMode,
            }),
          });
          if (res.ok) {
            setOriginalCode(code);
            setMessage("Saved");
            setTimeout(() => setMessage(""), 2000);
          }
        } else if (espMode && !espRecordId && effectiveAccountKey) {
          // First save for new ESP template — create record
          const res = await fetch("/api/esp/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountKey: effectiveAccountKey,
              name: espTemplateName || "Untitled Template",
              subject: espSubject || null,
              previewText: espPreviewText || null,
              source: code,
              html: previewHtml || code,
              editorType: editorMode,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setEspRecordId(data.template.id);
            setOriginalCode(code);
            setMessage("Saved");
            setTimeout(() => setMessage(""), 2000);
          }
        } else if (design) {
          // Save library template
          const res = await fetch("/api/templates", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ design, type: templateName, raw: code }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.slug && data.slug !== design) setDesign(data.slug);
            setOriginalCode(code);
            setMessage("Saved");
            setTimeout(() => setMessage(""), 2000);
          }
        }
      } catch { /* silent */ }
      setSaving(false);
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, originalCode, design, templateName, espMode, espRecordId, effectiveAccountKey, espTemplateName, espSubject, espPreviewText]);

  useEffect(() => {
    if (isHtmlOnlyBuilder) {
      setEditorMode("code");
      setVisualTab("settings");
    }
  }, [isHtmlOnlyBuilder]);

  useEffect(() => {
    loadPreviewContacts();
  }, [loadPreviewContacts]);

  // Keep selectedComponent ref in sync for iframe load handler
  useEffect(() => {
    selectedComponentRef.current = selectedComponent;
  }, [selectedComponent]);

  // Lazy-load section tags when picker opens
  useEffect(() => {
    if (showComponentPicker && !sectionTags) {
      fetch("/api/component-tags")
        .then((r) => r.json())
        .then((data) => setSectionTags(data))
        .catch(() => setSectionTags({ tags: [], assignments: {} }));
    }
    if (!showComponentPicker) {
      setPickerTag("all");
    }
  }, [showComponentPicker, sectionTags]);

  // Re-compile preview when selected preview data changes
  useEffect(() => {
    if (!code) return;
    const htmlForPreview =
      editorMode === "visual" && parsed
        ? serializeTemplateForPreview(parsed, hiddenComponents)
        : code;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(
      () => compilePreview(htmlForPreview),
      1000,
    );
  }, [
    previewVariableMap,
    editorMode,
    parsed,
    hiddenComponents,
    code,
    compilePreview,
  ]);

  const handleCodeChange = (newCode: string) => {
    if (!historySkipRef.current) pushHistory(code);
    historySkipRef.current = false;
    setCode(newCode);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => compilePreview(newCode), 1000);
  };

  const handleModeSwitch = async (mode: EditorMode) => {
    if (mode === editorMode) return;
    if (mode === "visual") {
      if (hasChanges) {
        await fetch("/api/templates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            design,
            type: templateName,
            raw: code,
            createSnapshot: false,
          }),
        });
        setOriginalCode(code);
      }
      const parsedRes = await fetch(
        `/api/templates?design=${design}&type=${templateName}`,
      );
      const parsedData = await parsedRes.json();
      if (parsedData.frontmatter) {
        setParsed(parsedData);
        // Recompile preview with markers for click-to-select
        const previewCode = serializeTemplateForPreview(
          parsedData,
          hiddenComponents,
        );
        compilePreview(previewCode);
      }
    }
    setEditorMode(mode);
  };

  const updateComponentProp = (
    compIndex: number,
    key: string,
    value: string,
  ) => {
    // Read from ref so that multiple synchronous calls (e.g. border editor
    // setting shorthand + 4 per-side props) each see the accumulated state.
    const currentParsed = parsedRef.current ?? parsed;
    if (!currentParsed) return;
    const newComponents = [...currentParsed.components];
    const newProps = { ...newComponents[compIndex].props };
    if (!value && key.startsWith('m:')) {
      // Clear mobile override — remove the key entirely
      delete newProps[key];
    } else {
      newProps[key] = value;
    }
    newComponents[compIndex] = {
      ...newComponents[compIndex],
      props: newProps,
    };
    const newParsed = { ...currentParsed, components: newComponents };
    parsedRef.current = newParsed; // Update ref immediately for next synchronous call
    setParsed(newParsed);
    syncVisualToCode(newParsed);
  };

  const updateFrontmatter = (key: string, value: string) => {
    if (!parsed) return;
    const newParsed = {
      ...parsed,
      frontmatter: { ...parsed.frontmatter, [key]: value },
    };
    setParsed(newParsed);
    syncVisualToCode(newParsed);
  };

  const updateBaseProp = (key: string, value: string) => {
    if (!parsed) return;
    const newBaseProps = { ...parsed.baseProps };
    if (value) {
      newBaseProps[key] = value;
    } else {
      delete newBaseProps[key];
    }
    const newParsed = { ...parsed, baseProps: newBaseProps };
    setParsed(newParsed);
    syncVisualToCode(newParsed);
  };

  // Update global button style props on CTA + Hero components.
  const updateCtaComponents = (propKey: string, value: string) => {
    if (!parsed) return;
    const canonicalKey =
      CTA_PROP_ALIASES[propKey]
        ? propKey
        : (Object.entries(CTA_PROP_ALIASES).find(([, aliases]) =>
            aliases.includes(propKey),
          )?.[0] ?? propKey);
    const legacyKeys = CTA_PROP_ALIASES[canonicalKey] || [];

    const newComponents = parsed.components.map((comp) => {
      if (comp.type !== "cta" && comp.type !== "hero") return comp;
      const newProps = { ...comp.props };
      if (comp.type === "cta") {
        if (value) {
          newProps[canonicalKey] = value;
        } else {
          delete newProps[canonicalKey];
        }
        for (const legacyKey of legacyKeys) delete newProps[legacyKey];
      } else if (comp.type === "hero") {
        const heroKeys = HERO_BUTTON_PROP_MAP[canonicalKey] || [];
        for (const heroKey of heroKeys) {
          if (value) newProps[heroKey] = value;
          else delete newProps[heroKey];
        }
      }
      return { ...comp, props: newProps };
    });
    const newParsed = { ...parsed, components: newComponents };
    setParsed(newParsed);
    syncVisualToCode(newParsed);
  };

  const syncVisualToCode = useCallback(
    (template: ParsedTemplate, hidden?: Set<number>) => {
      if (!historySkipRef.current) pushHistory(code);
      historySkipRef.current = false;
      const newCode = serializeTemplateClient(template);
      setCode(newCode);
      // For preview, use marker-injected serializer
      const h = hidden ?? hiddenComponents;
      const previewCode = serializeTemplateForPreview(template, h);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(
        () => compilePreview(previewCode),
        1000,
      );
    },
    [compilePreview, hiddenComponents, code, pushHistory],
  );

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  const handleCopySuggestion = useCallback(
    async (value: string) => {
      await copyText(value);
      setCopiedSuggestion(value);
      setTimeout(() => setCopiedSuggestion(""), 1500);
    },
    [copyText],
  );

  const applyAiEdits = useCallback(
    (edits: AssistantComponentEdit[]) => {
      if (
        !parsed ||
        selectedComponent === null ||
        !parsed.components[selectedComponent]
      ) {
        setAiError("Select a section first, then apply AI prop edits.");
        return;
      }
      if (edits.length === 0) return;

      const current = parsed.components[selectedComponent];
      const updated = {
        ...current,
        props: { ...current.props },
      };

      for (const edit of edits) {
        if (!edit.key) continue;
        updated.props[edit.key] = edit.value;
      }

      const nextComponents = [...parsed.components];
      nextComponents[selectedComponent] = updated;
      const nextParsed = { ...parsed, components: nextComponents };
      setParsed(nextParsed);
      syncVisualToCode(nextParsed);

      setMessage(
        `Applied ${edits.length} AI edit${edits.length === 1 ? "" : "s"} to section ${selectedComponent + 1}`,
      );
      setTimeout(() => setMessage(""), 3000);
    },
    [parsed, selectedComponent, syncVisualToCode],
  );

  const handleGenerateEmailMeta = useCallback(async (field: "subject" | "previewText") => {
    setAiMetaLoading(true);
    setAiMetaField(field);
    try {
      const textContent = previewHtml
        ? (() => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(previewHtml, "text/html");
            return doc.body.textContent?.trim() || "";
          })()
        : "";

      const res = await fetch("/api/ai/generate-email-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          emailTextContent: textContent.slice(0, 3000),
          currentSubject: espSubject,
          currentPreviewText: espPreviewText,
        }),
      });
      const data = await res.json();
      if (data.result) {
        if (field === "subject") setEspSubject(data.result);
        else setEspPreviewText(data.result);
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error("AI generation failed:", err);
      toast.error("Failed to generate — check AI configuration");
    } finally {
      setAiMetaLoading(false);
      setAiMetaField(null);
    }
  }, [previewHtml, espSubject, espPreviewText]);

  const handleAskAssistant = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiLoading) return;

    setAiLoading(true);
    setAiError("");
    setAiPrompt("");

    // Add user message to history immediately for display
    const userMsg = { role: "user" as const, content: prompt };
    setAiHistory((prev) => [...prev, userMsg]);

    try {
      // Build condensed history for API (last 5 exchanges = 10 messages max)
      const apiHistory = aiHistory.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          history: apiHistory,
          context: {
            design,
            template: templateName,
            mode: editorMode,
            frontmatter: parsed?.frontmatter || {},
            baseProps: parsed?.baseProps || {},
            componentCount: parsed?.components.length || 0,
            selectedComponent: selectedEditorComponent,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "AI request failed");
        return;
      }

      const reply = typeof data.reply === "string" ? data.reply : "";
      const suggestions = Array.isArray(data.suggestions)
        ? data.suggestions.filter(
            (row: unknown): row is string => typeof row === "string",
          )
        : [];
      const componentEdits = Array.isArray(data.componentEdits)
        ? data.componentEdits
            .filter(
              (row: unknown): row is Record<string, unknown> =>
                Boolean(row) && typeof row === "object",
            )
            .map((row: Record<string, unknown>) => ({
              key: typeof row.key === "string" ? row.key : "",
              value: typeof row.value === "string" ? row.value : "",
              reason: typeof row.reason === "string" ? row.reason : undefined,
            }))
            .filter((row: AssistantComponentEdit) => row.key && row.value)
        : [];

      setAiReply(reply);
      setAiSuggestions(suggestions);
      setAiComponentEdits(componentEdits);

      // Add assistant response to history
      const assistantMsg = {
        role: "assistant" as const,
        content: reply,
        suggestions,
        componentEdits,
      };
      setAiHistory((prev) => [...prev, assistantMsg]);

      // Auto-scroll to bottom
      setTimeout(() => {
        aiScrollRef.current?.scrollTo({
          top: aiScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    } catch (err: any) {
      setAiError(err.message || "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }, [
    aiPrompt,
    aiLoading,
    aiHistory,
    design,
    editorMode,
    parsed,
    selectedEditorComponent,
    templateName,
  ]);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    futureRef.current.push(code);
    historySkipRef.current = true;
    setCode(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    // Re-parse for visual mode
    if (editorMode === "visual") {
      const reparsed = parseTemplate(prev);
      setParsed(reparsed);
      const previewCode = serializeTemplateForPreview(
        reparsed,
        hiddenComponents,
      );
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(
        () => compilePreview(previewCode),
        1000,
      );
    } else {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => compilePreview(prev), 1000);
    }
  }, [code, editorMode, hiddenComponents, compilePreview]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(code);
    historySkipRef.current = true;
    setCode(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    // Re-parse for visual mode
    if (editorMode === "visual") {
      const reparsed = parseTemplate(next);
      setParsed(reparsed);
      const previewCode = serializeTemplateForPreview(
        reparsed,
        hiddenComponents,
      );
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(
        () => compilePreview(previewCode),
        1000,
      );
    } else {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => compilePreview(next), 1000);
    }
  }, [code, editorMode, hiddenComponents, compilePreview]);

  // Undo/redo keyboard shortcuts (visual mode only — Monaco has its own)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editorMode === "code") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorMode, handleUndo, handleRedo]);

  const handlePreviewComponentClick = useCallback((componentIndex: number) => {
    setSelectedComponent(componentIndex);
    // Collapse all previously expanded, then expand only the clicked one
    setExpandedComponents(new Set([componentIndex]));
    // Switch to Components tab if on Settings
    setVisualTab("components");
    // Scroll sidebar to show this component
    setTimeout(() => {
      const el = document.querySelector(
        `[data-sidebar-component="${componentIndex}"]`,
      );
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }, []);

  const toggleComponent = (index: number) => {
    setExpandedComponents((prev) => {
      if (prev.has(index)) {
        // Closing the currently open component
        if (selectedComponent === index) setSelectedComponent(null);
        return new Set<number>();
      } else {
        // Open this component, close all others
        setSelectedComponent(index);
        return new Set<number>([index]);
      }
    });
  };

  const toggleComponentVisibility = (index: number) => {
    setHiddenComponents((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      // Re-render preview with updated visibility
      if (parsed) {
        const previewCode = serializeTemplateClient({
          ...parsed,
          components: parsed.components.filter((_, i) => !next.has(i)),
        });
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(
          () => compilePreview(previewCode),
          1000,
        );
      }
      return next;
    });
  };

  const handleAddComponent = (componentType: string) => {
    if (!parsed) return;
    const schema = componentSchemas[componentType];
    const newProps: Record<string, string> = {};
    if (schema) {
      for (const prop of schema.props) {
        if (prop.default) {
          newProps[prop.key] = prop.default;
        } else if (prop.required) {
          newProps[prop.key] = `[${prop.label}]`;
        }
      }
    }
    const newComponent = { type: componentType, props: newProps };
    const newComponents = [...parsed.components, newComponent];
    const newParsed = { ...parsed, components: newComponents };
    setParsed(newParsed);
    setExpandedComponents(
      (prev) => new Set([...prev, newComponents.length - 1]),
    );
    setShowComponentPicker(false);
    syncVisualToCode(newParsed);
  };

  const handleDeleteComponent = (index: number) => {
    if (!parsed) return;
    const newComponents = parsed.components.filter((_, i) => i !== index);
    const newParsed = { ...parsed, components: newComponents };
    setParsed(newParsed);
    const remapDelete = (oldSet: Set<number>) => {
      const next = new Set<number>();
      for (const i of oldSet) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    };
    setExpandedComponents((prev) => remapDelete(prev));
    setHiddenComponents((prev) => remapDelete(prev));
    syncVisualToCode(newParsed);
  };

  const handleDuplicateComponent = (index: number) => {
    if (!parsed) return;
    const original = parsed.components[index];
    const clone = { ...original, props: { ...original.props } };
    const newComponents = [...parsed.components];
    newComponents.splice(index + 1, 0, clone);
    const newParsed = { ...parsed, components: newComponents };
    setParsed(newParsed);
    const remapInsert = (oldSet: Set<number>) => {
      const next = new Set<number>();
      for (const i of oldSet) {
        if (i <= index) next.add(i);
        else next.add(i + 1);
      }
      return next;
    };
    setExpandedComponents((prev) => remapInsert(prev));
    setHiddenComponents((prev) => remapInsert(prev));
    syncVisualToCode(newParsed);
  };

  const handleReorderComponent = (from: number, to: number) => {
    if (!parsed || from === to) return;
    const newComponents = [...parsed.components];
    const [moved] = newComponents.splice(from, 1);
    newComponents.splice(to, 0, moved);
    const newParsed = { ...parsed, components: newComponents };
    setParsed(newParsed);
    const remapSet = (oldSet: Set<number>) => {
      const next = new Set<number>();
      for (const i of oldSet) {
        let newIdx = i;
        if (i === from) {
          newIdx = to;
        } else if (from < to) {
          if (i > from && i <= to) newIdx = i - 1;
        } else {
          if (i >= to && i < from) newIdx = i + 1;
        }
        next.add(newIdx);
      }
      return next;
    };
    setExpandedComponents((prev) => remapSet(prev));
    setHiddenComponents((prev) => remapSet(prev));
    setDragIndex(null);
    setDragOverIndex(null);
    syncVisualToCode(newParsed);
  };

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    setMessage("");
    try {
      let res: Response;
      if (espMode && espRecordId) {
        res = await fetch(`/api/esp/templates/${espRecordId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: espTemplateName || undefined,
            subject: espSubject || undefined,
            previewText: espPreviewText || undefined,
            source: code,
            html: previewHtml || undefined,
            editorType: editorMode,
          }),
        });
      } else if (espMode && !espRecordId && effectiveAccountKey) {
        res = await fetch("/api/esp/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountKey: effectiveAccountKey,
            name: espTemplateName || "Untitled Template",
            subject: espSubject || null,
            previewText: espPreviewText || null,
            source: code,
            html: previewHtml || code,
            editorType: editorMode,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setEspRecordId(data.template.id);
        }
      } else {
        res = await fetch("/api/templates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ design, type: templateName, raw: code }),
        });
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.slug && data.slug !== design) setDesign(data.slug);
        setOriginalCode(code);
        setMessage("Saved");
        setTimeout(() => setMessage(""), 3000);
        return true;
      }
      setMessage("Error saving");
      return false;
    } catch {
      setMessage("Error saving");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Save Template (to Loomi + optional ESP providers) ──
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateProviders, setSaveTemplateProviders] = useState<Record<string, boolean>>({});
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateResults, setSaveTemplateResults] = useState<Record<string, { success: boolean; error?: string }> | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [saveToLibraryResult, setSaveToLibraryResult] = useState<{ success: boolean; error?: string } | null>(null);

  const connectedProviders = useMemo(
    () => effectiveAccountData?.connectedProviders ?? [],
    [effectiveAccountData],
  );

  const PROVIDER_META: Record<string, { displayName: string; iconSrc: string }> = {
    ghl: {
      displayName: "GoHighLevel",
      iconSrc: "https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3c254da0462343bf828.jpg",
    },
    klaviyo: {
      displayName: "Klaviyo",
      iconSrc: "https://storage.googleapis.com/msgsndr/CVpny6EUSHRxlXfqAFb7/media/6992d3ac3b3cc9155bdaf06e.png",
    },
  };

  const handleOpenSaveTemplate = () => {
    // Reset state
    setSaveTemplateResults(null);
    setSaveToLibrary(false);
    setSaveToLibraryResult(null);
    const initial: Record<string, boolean> = {};
    for (const p of connectedProviders) initial[p] = true;
    setSaveTemplateProviders(initial);
    setShowSaveTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    setSaveTemplateResults(null);
    try {
      // 1. Save locally first
      if (hasChanges) {
        const saved = await handleSave();
        if (!saved) {
          setSavingTemplate(false);
          return;
        }
      }

      // Save to template library if checked
      let librarySaved = false;
      if (saveToLibrary) {
        try {
          const templateTitle = parsed?.frontmatter?.title || designLabel;
          const slug = templateTitle
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

          // Create or check if exists
          const createRes = await fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ design: slug }),
          });

          if (!createRes.ok && createRes.status !== 409) {
            const err = await createRes.json();
            setSaveToLibraryResult({ success: false, error: err.error || "Failed to create library entry" });
          } else {
            // Save the actual content
            const putRes = await fetch("/api/templates", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ design: slug, raw: code }),
            });

            if (putRes.ok) {
              librarySaved = true;
              setSaveToLibraryResult({ success: true });
            } else {
              const err = await putRes.json();
              setSaveToLibraryResult({ success: false, error: err.error || "Failed to save to library" });
            }
          }
        } catch {
          setSaveToLibraryResult({ success: false, error: "Failed to save to library" });
        }
      }

      // Check which providers are selected
      const selectedProviders = Object.entries(saveTemplateProviders)
        .filter(([, checked]) => checked)
        .map(([p]) => p);

      if (selectedProviders.length === 0) {
        // No provider publishing — show appropriate toast
        if (librarySaved) {
          toast.success("Template saved on Loomi and added to library");
        } else {
          toast.success("Template saved on Loomi");
        }
        setShowSaveTemplateModal(false);
        setSavingTemplate(false);
        return;
      }

      // 2. Compile to get final HTML for ESP
      let compiledHtml = previewHtml;
      if (!compiledHtml) {
        const compileRes = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: code, project: "core" }),
        });
        const compileData = await compileRes.json();
        if (compileData.html) compiledHtml = compileData.html;
      }

      if (!compiledHtml) {
        toast.error("Failed to compile template HTML");
        setSavingTemplate(false);
        return;
      }

      // 3. Create ESP template record
      const templateTitle = parsed?.frontmatter?.title || designLabel;
      const createRes = await fetch("/api/esp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountKey: effectiveAccountKey,
          name: templateTitle,
          subject: espSubject || parsed?.frontmatter?.title || "",
          html: compiledHtml,
          source: code,
          editorType: editorMode === "code" ? "code" : "visual",
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        toast.error(err.error || "Failed to create template");
        setSavingTemplate(false);
        return;
      }

      const { template: espTemplate } = await createRes.json();

      // 4. Publish to selected providers
      const publishRes = await fetch(`/api/esp/templates/${espTemplate.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: selectedProviders }),
      });

      if (!publishRes.ok) {
        const err = await publishRes.json();
        toast.error(err.error || "Failed to publish template");
        setSavingTemplate(false);
        return;
      }

      const { results } = await publishRes.json();
      setSaveTemplateResults(results);

      // Check results
      const allSuccess = Object.values(results).every((r: any) => r.success);
      const anySuccess = Object.values(results).some((r: any) => r.success);

      if (allSuccess) {
        toast.success(`Template saved and published to ${selectedProviders.map(p => PROVIDER_META[p]?.displayName || p).join(", ")}`);
        setTimeout(() => setShowSaveTemplateModal(false), 1500);
      } else if (anySuccess) {
        toast.warning("Template published to some integrations — check results below");
      } else {
        toast.error("Failed to publish template");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!confirm("Restore this version? Current content will be replaced."))
      return;
    setRestoringVersionId(versionId);
    setMessage("");
    try {
      const res = await fetch("/api/templates/history/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          design,
          type: templateName,
          versionId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.raw) {
        setMessage(data.error || "Failed to restore version");
        return;
      }

      const restoredRaw = data.raw as string;
      historyRef.current = [];
      futureRef.current = [];
      historySkipRef.current = true;
      setCanUndo(false);
      setCanRedo(false);
      setExpandedComponents(new Set());
      setHiddenComponents(new Set());
      setSelectedComponent(null);
      setCode(restoredRaw);
      setOriginalCode(restoredRaw);

      const reparsed = parseTemplate(restoredRaw);
      setParsed(reparsed);
      const previewCode = serializeTemplateForPreview(reparsed, new Set());
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(
        () => compilePreview(previewCode),
        1000,
      );

      setMessage("Version restored");
      setTimeout(() => setMessage(""), 3000);
      setShowHistory(false);
      loadTemplateHistory();
    } catch {
      setMessage("Failed to restore version");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handleCopyHtml = async (format: "compiled" | "source" | "text" = "compiled") => {
    let content = "";
    if (format === "compiled") {
      if (!previewHtml) return;
      content = previewHtml;
    } else if (format === "source") {
      if (!code) return;
      content = code;
    } else if (format === "text") {
      if (!previewHtml) return;
      // Strip HTML tags to get plain text
      const tmp = document.createElement("div");
      tmp.innerHTML = previewHtml;
      content = tmp.textContent || tmp.innerText || "";
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setShowCopyDropdown(false);
    const labels = { compiled: "Compiled HTML", source: "Source Template", text: "Plain Text" };
    toast.success(`${labels[format]} copied!`);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Send Test Email ──
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSendTest, setShowSendTest] = useState(false);
  const [sendTestTo, setSendTestTo] = useState("");
  const [sendTestSubject, setSendTestSubject] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTest = useCallback(async () => {
    const to = sendTestTo.trim();
    if (!to || !previewHtml) return;
    setSendingTest(true);
    try {
      const res = await fetch("/api/emails/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject:
            sendTestSubject.trim() ||
            parsed?.frontmatter?.title ||
            templateName ||
            "Test Email",
          html: previewHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send test email");
        if (data.hint) toast.info(data.hint);
        return;
      }
      toast.success(
        `Test email sent to ${data.recipients} recipient${data.recipients === 1 ? "" : "s"}`,
      );
      setShowSendTest(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }, [sendTestTo, sendTestSubject, previewHtml, parsed, templateName]);

  const historyDiff = useMemo(
    () => buildSimpleDiff(code, selectedHistoryRaw),
    [code, selectedHistoryRaw],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement;

      // Cmd/Ctrl+S → Save
      if (mod && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      // Cmd/Ctrl+Shift+E → Toggle code/visual mode
      if (mod && e.shiftKey && e.key === "E") {
        e.preventDefault();
        handleModeSwitch(editorMode === "code" ? "visual" : "code");
        return;
      }
      // Cmd/Ctrl+Shift+P → Refresh preview
      if (mod && e.shiftKey && e.key === "P") {
        e.preventDefault();
        compilePreview(code);
        return;
      }
      // Cmd/Ctrl+Shift+A → Toggle AI assistant
      if (mod && e.shiftKey && e.key === "A") {
        e.preventDefault();
        setShowAiAssistant((prev) => !prev);
        return;
      }
      // Cmd/Ctrl+Shift+H → Open history
      if (mod && e.shiftKey && e.key === "H") {
        e.preventDefault();
        handleOpenHistory();
        return;
      }
      // ? → Show keyboard shortcuts (only when not in an input)
      if (e.key === "?" && !isInput && !mod) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }
      // Escape → Close modals/panels
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (showSaveTemplateModal) {
          setShowSaveTemplateModal(false);
          return;
        }
        if (showSendTest) {
          setShowSendTest(false);
          return;
        }
        if (showHistory) {
          setShowHistory(false);
          return;
        }
        if (showAiAssistant) {
          setShowAiAssistant(false);
          return;
        }
        if (showMissingVars) {
          setShowMissingVars(false);
          return;
        }
        if (showCopyDropdown) {
          setShowCopyDropdown(false);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    code,
    editorMode,
    showShortcuts,
    showSaveTemplateModal,
    showSendTest,
    showHistory,
    showAiAssistant,
    showMissingVars,
    showCopyDropdown,
  ]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showCopyDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-copy-dropdown]")) {
        setShowCopyDropdown(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showCopyDropdown]);

  const syncPreviewFrameWidth = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const isMobilePreview = previewWidth === "mobile";
    const frameWidth = isMobilePreview ? "375px" : "100%";
    const frameMaxWidth = isMobilePreview ? "375px" : "100%";
    const frameMinWidth = isMobilePreview ? "375px" : "0px";

    iframe.style.setProperty("width", frameWidth, "important");
    iframe.style.setProperty("max-width", frameMaxWidth, "important");
    iframe.style.setProperty("min-width", frameMinWidth, "important");

    const wrapper = iframe.parentElement as HTMLElement | null;
    if (wrapper) {
      wrapper.style.setProperty("width", frameWidth, "important");
      wrapper.style.setProperty("max-width", frameMaxWidth, "important");
      wrapper.style.setProperty("min-width", frameMinWidth, "important");
    }
  }, [previewWidth]);

  useEffect(() => {
    syncPreviewFrameWidth();
  }, [syncPreviewFrameWidth, previewHtml]);

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      syncPreviewFrameWidth();
      const doc = iframe.contentDocument;
      if (!doc) return;

      syncPreviewMobileNormalizeStyle(doc, previewWidth === "mobile");

      // Force mobile-specific media rules in the embedded preview document.
      syncPreviewMobileStyles(doc, previewWidth === "mobile");
      normalizePreviewMobileLayout(doc, previewWidth === "mobile");

      // Auto-size iframe
      const height = doc.body?.scrollHeight;
      if (height && height > 100) {
        iframe.style.height = `${height + 20}px`;
      }

      // Inject interaction styles for click-to-select
      const style = doc.createElement("style");
      style.textContent = `
        tr[data-loomi] { cursor: pointer; position: relative; }
        tr[data-loomi] > td { transition: outline-color 0.15s ease; outline: 3px solid transparent; outline-offset: -3px; }
        tr[data-loomi]:hover > td { outline-color: rgba(99, 102, 241, 0.45); }
        tr[data-loomi].loomi-selected > td { outline-color: rgb(99, 102, 241); }
        /* Don't highlight nested data-loomi elements (child rows within a component) */
        tr[data-loomi] tr[data-loomi] > td { outline: none !important; }
        tr[data-loomi] tr[data-loomi] { cursor: default; }
        /* Floating toolbar */
        .loomi-toolbar {
          position: absolute; top: 0; left: 0; z-index: 9999;
          display: flex; gap: 2px; padding: 2px;
          background: rgba(24, 24, 27, 0.9); border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          pointer-events: auto;
        }
        .loomi-toolbar button {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border: none; border-radius: 4px;
          background: transparent; cursor: pointer; padding: 0;
          color: rgba(255,255,255,0.7); transition: all 0.15s ease;
        }
        .loomi-toolbar button:hover { background: rgba(255,255,255,0.15); color: #fff; }
        .loomi-toolbar button.loomi-tb-delete:hover { color: #f87171; background: rgba(248,113,113,0.15); }
        .loomi-toolbar button:disabled { opacity: 0.3; cursor: default; }
        .loomi-toolbar button:disabled:hover { background: transparent; color: rgba(255,255,255,0.7); }
        .loomi-toolbar .loomi-tb-sep { width: 1px; background: rgba(255,255,255,0.15); margin: 4px 1px; }
      `;
      doc.head?.appendChild(style);

      // Create floating toolbar element
      const toolbar = doc.createElement("div");
      toolbar.className = "loomi-toolbar";
      toolbar.style.display = "none";
      toolbar.innerHTML = `
        <button class="loomi-tb-up" title="Move up">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
        <button class="loomi-tb-down" title="Move down">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="loomi-tb-sep"></div>
        <button class="loomi-tb-duplicate" title="Duplicate section">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="loomi-tb-delete" title="Delete section">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;
      doc.body?.appendChild(toolbar);

      let toolbarIdx: number | null = null;
      let toolbarHost: HTMLElement | null = null;
      let toolbarAnchor: HTMLElement | null = null;

      const findClosestLoomi = (el: HTMLElement): HTMLElement | null => {
        return el.closest("tr[data-loomi]") as HTMLElement | null;
      };

      // Helper to find outermost data-loomi ancestor
      const findOuterLoomi = (el: HTMLElement): HTMLElement | null => {
        let tr = el.closest("tr[data-loomi]") as HTMLElement | null;
        if (!tr) return null;
        let outer = tr;
        let p = tr.parentElement?.closest(
          "tr[data-loomi]",
        ) as HTMLElement | null;
        while (p) {
          outer = p;
          p = p.parentElement?.closest("tr[data-loomi]") as HTMLElement | null;
        }
        return outer;
      };

      const findComponentRootByIndex = (idx: number): HTMLElement | null => {
        const rows = Array.from(
          doc.querySelectorAll(`tr[data-loomi="${idx}"]`),
        ) as HTMLElement[];
        if (!rows.length) return null;
        const roots = rows.filter(
          (row) =>
            !row.parentElement?.closest(`tr[data-loomi="${idx}"]`),
        );
        return roots[0] || rows[0];
      };

      const positionToolbar = (anchorEl: HTMLElement) => {
        const win = doc.defaultView;
        const scrollX = win?.scrollX ?? doc.documentElement.scrollLeft ?? 0;
        const scrollY = win?.scrollY ?? doc.documentElement.scrollTop ?? 0;
        const viewportWidth = doc.documentElement.clientWidth || win?.innerWidth || 0;
        const viewportHeight = doc.documentElement.clientHeight || win?.innerHeight || 0;
        const margin = 8;

        const anchorRect = anchorEl.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();

        let left: number;
        let top = anchorRect.top + scrollY + margin;
        const isMobileMode = previewWidth === "mobile";

        if (isMobileMode) {
          // In mobile preview, keep controls inside the hovered component bounds.
          left = anchorRect.right + scrollX - toolbarRect.width - margin;
        } else {
          // Desktop: prefer outside-right when there is room; otherwise place inside-right.
          const outsideLeft = anchorRect.right + scrollX + margin;
          const outsideFits =
            outsideLeft + toolbarRect.width <= scrollX + viewportWidth - margin;
          left = outsideFits
            ? outsideLeft
            : anchorRect.right + scrollX - toolbarRect.width - margin;
        }

        const minLeft = scrollX + margin;
        const maxLeft = Math.max(
          minLeft,
          scrollX + viewportWidth - toolbarRect.width - margin,
        );
        left = Math.min(Math.max(left, minLeft), maxLeft);

        const minTop = scrollY + margin;
        const maxTop = Math.max(
          minTop,
          scrollY + viewportHeight - toolbarRect.height - margin,
        );
        top = Math.min(Math.max(top, minTop), maxTop);

        toolbar.style.left = `${Math.round(left)}px`;
        toolbar.style.top = `${Math.round(top)}px`;
      };

      const showToolbar = (
        hostTr: HTMLElement,
        idx: number,
        anchorTr: HTMLElement,
      ) => {
        toolbarIdx = idx;
        toolbarHost = hostTr;
        toolbarAnchor = anchorTr;
        doc.body?.appendChild(toolbar);
        toolbar.style.display = "flex";
        positionToolbar(anchorTr);
        const total = parsed?.components.length ?? 0;
        const upBtn = toolbar.querySelector(
          ".loomi-tb-up",
        ) as HTMLButtonElement | null;
        const downBtn = toolbar.querySelector(
          ".loomi-tb-down",
        ) as HTMLButtonElement | null;
        if (upBtn) upBtn.disabled = idx <= 0;
        if (downBtn) downBtn.disabled = idx >= total - 1;
      };

      const hideToolbar = () => {
        toolbar.style.display = "none";
        doc.body?.appendChild(toolbar);
        toolbarIdx = null;
        toolbarHost = null;
        toolbarAnchor = null;
      };

      // Hover to show toolbar
      doc.addEventListener("mouseover", (e: Event) => {
        const target = e.target as HTMLElement;
        if (toolbar.contains(target)) return;
        const closest = findClosestLoomi(target);
        const outer = findOuterLoomi(target);
        const hovered = closest || outer;
        if (!hovered) {
          hideToolbar();
          return;
        }
        const idx = parseInt(hovered.getAttribute("data-loomi") || "", 10);
        if (isNaN(idx)) return;
        const componentRoot = findComponentRootByIndex(idx) || outer || hovered;
        if (
          idx !== toolbarIdx ||
          toolbarHost !== componentRoot ||
          toolbarAnchor !== componentRoot
        ) {
          showToolbar(componentRoot, idx, componentRoot);
        } else {
          positionToolbar(componentRoot);
        }
      });

      doc.addEventListener("mouseleave", () => {
        hideToolbar();
      });

      doc.addEventListener(
        "scroll",
        () => {
          if (toolbar.style.display !== "none" && toolbarAnchor) {
            positionToolbar(toolbarAnchor);
          }
        },
        true,
      );

      // Toolbar button handlers
      toolbar
        .querySelector(".loomi-tb-duplicate")
        ?.addEventListener("click", (e: Event) => {
          e.stopPropagation();
          if (toolbarIdx !== null) {
            const idx = toolbarIdx;
            hideToolbar();
            handleDuplicateComponent(idx);
          }
        });

      toolbar
        .querySelector(".loomi-tb-delete")
        ?.addEventListener("click", (e: Event) => {
          e.stopPropagation();
          if (toolbarIdx !== null) {
            const idx = toolbarIdx;
            hideToolbar();
            handleDeleteComponent(idx);
          }
        });

      toolbar
        .querySelector(".loomi-tb-up")
        ?.addEventListener("click", (e: Event) => {
          e.stopPropagation();
          if (toolbarIdx !== null && toolbarIdx > 0) {
            const idx = toolbarIdx;
            hideToolbar();
            handleReorderComponent(idx, idx - 1);
          }
        });

      toolbar
        .querySelector(".loomi-tb-down")
        ?.addEventListener("click", (e: Event) => {
          e.stopPropagation();
          const total = parsed?.components.length ?? 0;
          if (toolbarIdx !== null && toolbarIdx < total - 1) {
            const idx = toolbarIdx;
            hideToolbar();
            handleReorderComponent(idx, idx + 1);
          }
        });

      // Attach click listener for component selection
      doc.addEventListener("click", (e: Event) => {
        const target = e.target as HTMLElement;
        if (toolbar.contains(target)) return;
        const outer = findOuterLoomi(target);
        if (!outer) return;
        const idx = parseInt(outer.getAttribute("data-loomi") || "", 10);
        if (isNaN(idx)) return;

        // Update visual selection in iframe
        doc
          .querySelectorAll("tr.loomi-selected")
          .forEach((el) => el.classList.remove("loomi-selected"));
        doc
          .querySelectorAll(`tr[data-loomi="${idx}"]`)
          .forEach((el) => el.classList.add("loomi-selected"));

        // Notify React
        handlePreviewComponentClick(idx);
      });

      // Re-apply selection if one was active before preview recompiled
      const sel = selectedComponentRef.current;
      if (sel !== null) {
        doc
          .querySelectorAll(`tr[data-loomi="${sel}"]`)
          .forEach((el) => el.classList.add("loomi-selected"));
      }
    } catch {}
  };

  // Bidirectional sync: when selectedComponent changes from sidebar, update preview highlight
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc
        .querySelectorAll("tr.loomi-selected")
        .forEach((el) => el.classList.remove("loomi-selected"));
      if (selectedComponent !== null) {
        const rows = doc.querySelectorAll(
          `tr[data-loomi="${selectedComponent}"]`,
        );
        rows.forEach((el) => el.classList.add("loomi-selected"));
        if (rows.length > 0) {
          rows[0].scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    } catch {}
  }, [selectedComponent]);

  const slugLabel = design
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const designLabel = (espMode || espTemplateId)
    ? (espTemplateName || "Loading...")
    : (parsed?.frontmatter?.title || slugLabel);
  const lineCount = code.split("\n").length;
  const backHref = espMode ? "/templates" : isAccount ? "/emails" : "/templates/library";

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Top toolbar */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div>
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const trimmed = editTitleValue.trim();
                    if (trimmed && espMode) {
                      setEspTemplateName(trimmed);
                      if (parsed) updateFrontmatter("title", trimmed);
                    } else if (trimmed && !espMode && parsed) {
                      updateFrontmatter("title", trimmed);
                    }
                    setIsEditingTitle(false);
                  } else if (e.key === "Escape") {
                    setIsEditingTitle(false);
                  }
                }}
                onBlur={() => {
                  const trimmed = editTitleValue.trim();
                  if (trimmed && espMode) {
                    setEspTemplateName(trimmed);
                    if (parsed) updateFrontmatter("title", trimmed);
                  } else if (trimmed && !espMode && parsed) {
                    updateFrontmatter("title", trimmed);
                  }
                  setIsEditingTitle(false);
                }}
                autoFocus
                className="text-lg font-bold bg-transparent border-b-2 border-[var(--primary)] text-[var(--foreground)] focus:outline-none w-64"
              />
            ) : (
              <div className="group/title flex items-center gap-1.5">
                <h2 className="text-lg font-bold capitalize">{designLabel}</h2>
                <button
                  onClick={() => {
                    setEditTitleValue(espMode ? espTemplateName : (parsed?.frontmatter?.title || designLabel));
                    setIsEditingTitle(true);
                  }}
                  className="p-1 rounded text-[var(--muted-foreground)] opacity-0 group-hover/title:opacity-100 hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-all"
                  title="Rename template"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <p className="text-xs text-[var(--muted-foreground)]">
              {editorMode === "code"
                ? `${lineCount} lines`
                : `${parsed?.components.length || 0} components`}
              {isHtmlOnlyBuilder && (
                <span className="text-[var(--primary)] ml-2">HTML-only builder</span>
              )}
              {hasChanges && (
                <span className="text-amber-400 ml-2">Unsaved changes</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {previewContactsError && (
            <span className="text-[10px] text-amber-400 mr-1">
              {previewContactsError}
            </span>
          )}
          {message && (
            <span className="text-xs text-green-400 mr-2">{message}</span>
          )}
          {/* Ask Loomi */}
          <button
            onClick={() => setShowAiAssistant((prev) => !prev)}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
              showAiAssistant
                ? "text-white border-pink-300/70 ring-1 ring-cyan-300/35 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 shadow-[0_8px_24px_rgba(45,212,191,0.35)]"
                : "ai-ed-btn-inactive hover:ring-1 hover:ring-cyan-300/25 hover:shadow-[0_6px_18px_rgba(45,212,191,0.22)]"
            }`}
            title="Open AI assistant"
          >
            <SparklesIcon
              className={`w-3.5 h-3.5 transition-transform ${showAiAssistant ? "scale-110" : "group-hover:scale-110 group-hover:rotate-6"}`}
            />
            Ask Loomi
          </button>
          {/* Send Test */}
          <button
            onClick={() => {
              setSendTestSubject(
                parsed?.frontmatter?.title || templateName || "",
              );
              setShowSendTest(true);
            }}
            disabled={!previewHtml}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
            title="Send compiled HTML as test email"
          >
            <EnvelopeIcon className="w-3.5 h-3.5" />
            Send Test
          </button>
          {/* Save Template */}
          <button
            onClick={handleOpenSaveTemplate}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            title="Save template"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="currentColor" className="w-4 h-4"><path d="M 7 4 C 5.3545455 4 4 5.3545455 4 7 L 4 43 C 4 44.645455 5.3545455 46 7 46 L 43 46 C 44.645455 46 46 44.645455 46 43 L 46 13.199219 A 1.0001 1.0001 0 0 0 45.707031 12.492188 L 37.507812 4.2929688 A 1.0001 1.0001 0 0 0 36.800781 4 L 7 4 z M 7 6 L 12 6 L 12 18 C 12 19.645455 13.354545 21 15 21 L 34 21 C 35.645455 21 37 19.645455 37 18 L 37 6.6132812 L 44 13.613281 L 44 43 C 44 43.554545 43.554545 44 43 44 L 38 44 L 38 29 C 38 27.354545 36.645455 26 35 26 L 15 26 C 13.354545 26 12 27.354545 12 29 L 12 44 L 7 44 C 6.4454545 44 6 43.554545 6 43 L 6 7 C 6 6.4454545 6.4454545 6 7 6 z M 14 6 L 35 6 L 35 18 C 35 18.554545 34.554545 19 34 19 L 15 19 C 14.445455 19 14 18.554545 14 18 L 14 6 z M 29 8 A 1.0001 1.0001 0 0 0 28 9 L 28 16 A 1.0001 1.0001 0 0 0 29 17 L 32 17 A 1.0001 1.0001 0 0 0 33 16 L 33 9 A 1.0001 1.0001 0 0 0 32 8 L 29 8 z M 30 10 L 31 10 L 31 15 L 30 15 L 30 10 z M 15 28 L 35 28 C 35.554545 28 36 28.445455 36 29 L 36 44 L 14 44 L 14 29 C 14 28.445455 14.445455 28 15 28 z"/></svg>
            Save Template
          </button>
          {/* History (clock icon only) */}
          <button
            onClick={handleOpenHistory}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Version History"
          >
            <ClockIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main split pane */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left panel — Editor */}
        <div className="w-[480px] flex-shrink-0 flex flex-col border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
          {/* Tabs */}
          <div className="flex items-center border-b border-[var(--border)] bg-[var(--muted)] flex-shrink-0">
            <button
              onClick={() => {
                handleModeSwitch("visual");
                setVisualTab("settings");
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${editorMode === "visual" && visualTab === "settings" ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
              Settings
            </button>
            {!isHtmlOnlyBuilder && (
              <button
                onClick={() => {
                  handleModeSwitch("visual");
                  setVisualTab("components");
                }}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${editorMode === "visual" && visualTab === "components" ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              >
                <SectionsIcon className="w-3.5 h-3.5" />
                Sections
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => handleModeSwitch("code")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${editorMode === "code" ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              <CodeBracketIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Editor content — single scroll container */}
          {editorMode === "code" ? (
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={code}
                onChange={handleCodeChange}
                language="html"
                onSave={handleSave}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4 space-y-2">
                {/* Settings sub-tab */}
                {visualTab === "settings" && espMode && (
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                      Email Meta
                    </h3>
                    <div className="space-y-3">
                      {/* Subject Line */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[var(--muted-foreground)]">Subject Line</label>
                          <button
                            onClick={() => handleGenerateEmailMeta("subject")}
                            disabled={aiMetaLoading}
                            className="group flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ai-ed-btn-inactive border border-[var(--ai-ed-btn-border)] hover:ring-1 hover:ring-cyan-300/25 hover:shadow-[0_4px_12px_rgba(45,212,191,0.18)] transition-all duration-200 disabled:opacity-50"
                            title="Generate with Loomi AI"
                          >
                            {aiMetaLoading && aiMetaField === "subject" ? (
                              <ArrowPathIcon className="w-3 h-3 animate-spin" />
                            ) : (
                              <SparklesIcon className="w-3 h-3 transition-transform group-hover:scale-110 group-hover:rotate-6" />
                            )}
                            Generate with Loomi AI
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={espSubject}
                            onChange={(e) => setEspSubject(e.target.value)}
                            placeholder="Enter subject line..."
                            className="flex-1 min-w-0 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          />
                          <VariablePickerButton onInsert={(token) => setEspSubject((prev) => prev + token)} />
                        </div>
                      </div>
                      {/* Preview Text */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[var(--muted-foreground)]">Preview Text</label>
                          <button
                            onClick={() => handleGenerateEmailMeta("previewText")}
                            disabled={aiMetaLoading}
                            className="group flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ai-ed-btn-inactive border border-[var(--ai-ed-btn-border)] hover:ring-1 hover:ring-cyan-300/25 hover:shadow-[0_4px_12px_rgba(45,212,191,0.18)] transition-all duration-200 disabled:opacity-50"
                            title="Generate with Loomi AI"
                          >
                            {aiMetaLoading && aiMetaField === "previewText" ? (
                              <ArrowPathIcon className="w-3 h-3 animate-spin" />
                            ) : (
                              <SparklesIcon className="w-3 h-3 transition-transform group-hover:scale-110 group-hover:rotate-6" />
                            )}
                            Generate with Loomi AI
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={espPreviewText}
                            onChange={(e) => setEspPreviewText(e.target.value)}
                            placeholder="Enter preview text..."
                            className="flex-1 min-w-0 text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                          />
                          <VariablePickerButton onInsert={(token) => setEspPreviewText((prev) => prev + token)} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {visualTab === "settings" &&
                  parsed &&
                  SETTINGS_SECTIONS.filter((s) => !(espMode && s.key === "meta")).map((section, sectionIdx) => (
                    <div key={section.key}>
                      <h3
                        className={`text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider ${sectionIdx > 0 || espMode ? "mt-4" : ""} mb-2`}
                      >
                        {section.label}
                      </h3>
                      <div className="space-y-3">
                        {(() => {
                          const resolveField = (f: SettingsField) => {
                            const fKey =
                              f.target === "frontmatter"
                                ? f.key.replace("fm:", "")
                                : f.key;
                            let val = "";
                            if (f.target === "frontmatter") {
                              val = parsed.frontmatter[fKey] || "";
                            } else if (f.target === "ctaComponents") {
                              const firstButtonComp = parsed.components.find(
                                (c) => c.type === "cta" || c.type === "hero",
                              );
                              if (firstButtonComp?.type === "cta") {
                                val = firstButtonComp?.props[fKey] || "";
                                if (!val) {
                                  const legacyKeys = CTA_PROP_ALIASES[fKey] || [];
                                  for (const legacyKey of legacyKeys) {
                                    const legacyVal = firstButtonComp?.props[legacyKey];
                                    if (legacyVal) {
                                      val = legacyVal;
                                      break;
                                    }
                                  }
                                }
                              } else if (firstButtonComp?.type === "hero") {
                                const heroKeys = HERO_BUTTON_PROP_MAP[fKey] || [];
                                for (const heroKey of heroKeys) {
                                  const heroVal = firstButtonComp?.props[heroKey];
                                  if (heroVal) {
                                    val = heroVal;
                                    break;
                                  }
                                }
                              }
                            } else {
                              val = parsed.baseProps[fKey] || "";
                            }
                            const handleChange = (v: string) => {
                              if (f.target === "frontmatter")
                                updateFrontmatter(fKey, v);
                              else if (f.target === "ctaComponents")
                                updateCtaComponents(fKey, v);
                              else updateBaseProp(fKey, v);
                            };
                            const handleLiveStyle = (v: string) => {
                              if (f.target === "baseProps") {
                                const cssProp = PROP_CSS_MAP[fKey];
                                if (cssProp)
                                  injectLiveBaseStyle(
                                    iframeRef.current,
                                    fKey,
                                    v,
                                  );
                              } else if (
                                f.target === "ctaComponents" &&
                                parsed
                              ) {
                                const cssProp = PROP_CSS_MAP[fKey];
                                if (cssProp)
                                  parsed.components.forEach((c, idx) => {
                                    if (c.type === "cta")
                                      injectLiveStyle(
                                        iframeRef.current,
                                        idx,
                                        cssProp,
                                        v,
                                      );
                                  });
                              }
                            };
                            return { val, handleChange, handleLiveStyle };
                          };
                          const elements: React.ReactNode[] = [];
                          const pairHalfSettingsFields = false;
                          let i = 0;
                          while (i < section.fields.length) {
                            const field = section.fields[i];
                            const next = section.fields[i + 1];
                            if (pairHalfSettingsFields && field.half && next?.half) {
                              const r1 = resolveField(field);
                              const r2 = resolveField(next);
                              elements.push(
                                <div
                                  key={`${field.key}-${next.key}`}
                                  className="flex gap-2"
                                >
                                  <div className="flex-1 min-w-0">
                                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                                      {field.label}
                                    </label>
                                    <PropField
                                      prop={field}
                                      value={r1.val}
                                      onChange={r1.handleChange}
                                      onLiveStyle={r1.handleLiveStyle}
                                      onInsertVariable={
                                        VARIABLE_ELIGIBLE_TYPES.has(field.type)
                                          ? (token: string) => r1.handleChange(r1.val + token)
                                          : undefined
                                      }
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                                      {next.label}
                                    </label>
                                    <PropField
                                      prop={next}
                                      value={r2.val}
                                      onChange={r2.handleChange}
                                      onLiveStyle={r2.handleLiveStyle}
                                      onInsertVariable={
                                        VARIABLE_ELIGIBLE_TYPES.has(next.type)
                                          ? (token: string) => r2.handleChange(r2.val + token)
                                          : undefined
                                      }
                                    />
                                  </div>
                                </div>,
                              );
                              i += 2;
                            } else {
                              const r = resolveField(field);
                              elements.push(
                                <div key={field.key}>
                                  <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                                    {field.label}
                                  </label>
                                  <PropField
                                    prop={field}
                                    value={r.val}
                                    onChange={r.handleChange}
                                    onLiveStyle={r.handleLiveStyle}
                                    onInsertVariable={
                                      VARIABLE_ELIGIBLE_TYPES.has(field.type)
                                        ? (token: string) => r.handleChange(r.val + token)
                                        : undefined
                                    }
                                  />
                                </div>,
                              );
                              i += 1;
                            }
                          }
                          return elements;
                        })()}
                      </div>
                    </div>
                  ))}

                {/* Components sub-tab */}
                {visualTab === "components" && (
                  <div
                    className="space-y-2"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragIndex === null) return;
                      const tops = dragTopsRef.current;
                      const heights = dragHeightsRef.current;
                      if (tops.length === 0) return;
                      const y = e.clientY;
                      // Find which original slot the cursor is over
                      let target = tops.length - 1;
                      for (let i = 0; i < tops.length; i++) {
                        const mid = tops[i] + heights[i] / 2;
                        if (y < mid) {
                          target = i;
                          break;
                        }
                      }
                      if (target !== dragOverIndex) setDragOverIndex(target);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragOverIndex !== null) {
                        handleReorderComponent(dragIndex, dragOverIndex);
                      }
                    }}
                  >
                    {parsed?.components.map((comp, index) => {
                      const schema = componentSchemas[comp.type];
                      const isExpanded = expandedComponents.has(index);
                      const label = schema?.label || comp.type;
                      const iconName = schema?.icon || "DocumentIcon";

                      const setProps = Object.keys(comp.props).filter(
                        (k) => k !== "rooftop" && k !== "component-index",
                      );
                      const allSchemaProps =
                        schema?.props.filter((p) => p.key !== "rooftop" && p.key !== "component-index") || [];

                      const rawProps = schema ? null : setProps;
                      const isHidden = hiddenComponents.has(index);

                      const isDragging = dragIndex === index;

                      const isSelected = selectedComponent === index;

                      // Compute pixel-exact shift for drag animation
                      let dragTransformPx = 0;
                      if (
                        dragIndex !== null &&
                        dragOverIndex !== null &&
                        dragIndex !== dragOverIndex &&
                        index !== dragIndex
                      ) {
                        const heights = dragHeightsRef.current;
                        const gap = 8; // space-y-2 = 0.5rem = 8px
                        if (dragIndex < dragOverIndex) {
                          // Dragging down: items between shift up by dragged item's height
                          if (index > dragIndex && index <= dragOverIndex) {
                            dragTransformPx = -(heights[dragIndex] + gap);
                          }
                        } else {
                          // Dragging up: items between shift down by dragged item's height
                          if (index >= dragOverIndex && index < dragIndex) {
                            dragTransformPx = heights[dragIndex] + gap;
                          }
                        }
                      }

                      return (
                        <div
                          key={index}
                          data-sidebar-component={index}
                          draggable
                          onMouseDownCapture={(e) => {
                            dragMouseTargetRef.current = e.target as HTMLElement;
                          }}
                          onDragStart={(e) => {
                            // Prevent drag when interacting with form controls (sliders, inputs, buttons, etc.)
                            const mouseTarget = dragMouseTargetRef.current;
                            if (mouseTarget) {
                              const tag = mouseTarget.tagName.toLowerCase();
                              if (tag === "input" || tag === "select" || tag === "textarea" || tag === "button" || mouseTarget.closest("button") || mouseTarget.closest(".range-slider")) {
                                e.preventDefault();
                                return;
                              }
                            }
                            // Measure all item positions before drag begins
                            const items = document.querySelectorAll(
                              "[data-sidebar-component]",
                            );
                            const h: number[] = [];
                            const t: number[] = [];
                            items.forEach((el) => {
                              const rect = (
                                el as HTMLElement
                              ).getBoundingClientRect();
                              h.push(rect.height);
                              t.push(rect.top);
                            });
                            dragHeightsRef.current = h;
                            dragTopsRef.current = t;
                            setDragIndex(index);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`flex items-stretch gap-1 ${isHidden ? "opacity-50" : ""}`}
                          style={{
                            opacity: isDragging ? 0.3 : undefined,
                            transform: dragTransformPx
                              ? `translateY(${dragTransformPx}px)`
                              : undefined,
                            transition:
                              dragIndex !== null
                                ? "transform 200ms ease"
                                : undefined,
                          }}
                        >
                          <div className="flex items-center cursor-grab active:cursor-grabbing text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex-shrink-0 px-0.5">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="7"
                              height="12"
                              viewBox="0 0 46 80"
                              className="fill-current"
                            >
                              <path d="M0 72c0-4.4 3.6-8 8-8s8 3.6 8 8s-3.6 8-8 8s-8-3.6-8-8m0-32c0-4.4 3.6-8 8-8s8 3.6 8 8s-3.6 8-8 8s-8-3.6-8-8M0 8c0-4.4 3.6-8 8-8s8 3.6 8 8s-3.6 8-8 8s-8-3.6-8-8m30 64c0-4.4 3.6-8 8-8s8 3.6 8 8s-3.6 8-8 8s-8-3.6-8-8m0-32c0-4.4 3.6-8 8-8s8 3.6 8 8s-3.6 8-8 8s-8-3.6-8-8m0-32c0-4.4 3.6-8 8-8s8 3.6 8 8s-3.6 8-8 8s-8-3.6-8-8" />
                            </svg>
                          </div>
                          <div
                            className={`flex-1 min-w-0 border rounded-xl overflow-hidden transition-all ${
                              isSelected
                                ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/30"
                                : isExpanded
                                  ? "border-[var(--primary)]"
                                  : "border-[var(--border)]"
                            }`}
                          >
                            <div
                              className={`group/comp flex items-center transition-colors ${isExpanded ? '' : 'hover:bg-[var(--muted)]'}`}
                              style={isExpanded ? { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' } : undefined}
                            >
                              <button
                                onClick={() => toggleComponent(index)}
                                className="flex-1 flex items-center gap-2 py-2.5 pl-3 pr-2 text-left cursor-pointer"
                              >
                                <ComponentIcon
                                  name={iconName}
                                  className="w-4 h-4 text-[var(--muted-foreground)]"
                                />
                                <span className="text-sm font-medium">
                                  {label}
                                </span>
                                {!isExpanded && setProps.length > 0 && (
                                  <span className="text-[10px] text-[var(--muted-foreground)] truncate max-w-[120px] ml-auto pr-1">
                                    {comp.props["headline"] ||
                                      comp.props["body"]?.slice(0, 30) ||
                                      comp.props["button-text"] ||
                                      comp.props["size"] ||
                                      ""}
                                  </span>
                                )}
                              </button>
                              <div
                                className={`flex items-center flex-shrink-0 overflow-hidden transition-all duration-200 ${isExpanded || isHidden ? "w-auto opacity-100" : "w-0 opacity-0 group-hover/comp:w-auto group-hover/comp:opacity-100"}`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleComponentVisibility(index);
                                  }}
                                  className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isHidden ? "text-amber-400 hover:text-amber-300" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                                  title={
                                    isHidden
                                      ? "Show in preview"
                                      : "Hide from preview"
                                  }
                                >
                                  {isHidden ? (
                                    <EyeSlashIcon className="w-3.5 h-3.5" />
                                  ) : (
                                    <EyeIcon className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDuplicateComponent(index);
                                  }}
                                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                                  title="Duplicate section"
                                >
                                  <Square2StackIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteComponent(index);
                                  }}
                                  className="p-1.5 mr-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                                  title="Remove section"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="px-3 pb-3">
                                {schema ? (
                                  <ComponentPropsRenderer
                                    schema={schema}
                                    props={comp.props}
                                    allSchemaProps={allSchemaProps}
                                    previewWidth={previewWidth}
                                    onPropChange={(key, val) =>
                                      updateComponentProp(index, key, val)
                                    }
                                    onLiveStyle={(key, val) => {
                                      const cssProp = PROP_CSS_MAP[key];
                                      if (cssProp)
                                        injectLiveStyle(
                                          iframeRef.current,
                                          index,
                                          cssProp,
                                          val,
                                        );
                                    }}
                                    onBrowseMedia={(propKey) =>
                                      handleBrowseMedia(index, propKey)
                                    }
                                    onInsertVariable={(propKey, token) =>
                                      updateComponentProp(index, propKey, (comp.props[propKey] || '') + token)
                                    }
                                  />
                                ) : (
                                  rawProps &&
                                  rawProps.map((key) => (
                                    <div key={key}>
                                      <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-mono">
                                        {key}
                                      </label>
                                      <input
                                        type="text"
                                        value={comp.props[key] || ""}
                                        onChange={(e) =>
                                          updateComponentProp(
                                            index,
                                            key,
                                            e.target.value,
                                          )
                                        }
                                        className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                                      />
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <button
                      onClick={() => setShowComponentPicker(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--primary)] transition-colors"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add Section
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right panel — Preview */}
        <div className="flex-1 flex flex-col border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)] min-w-0">
          <div className="flex items-center px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)] flex-shrink-0">
            {/* Left — Preview As */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--muted)]">
                <UserCircleIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                <select
                  value={selectedPreviewContactId}
                  onChange={(e) => setSelectedPreviewContactId(e.target.value)}
                  className="bg-transparent text-xs text-[var(--foreground)] focus:outline-none"
                >
                  <option value="__sample__">Preview As: Sample</option>
                  {previewContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.fullName ||
                        [contact.firstName, contact.lastName]
                          .filter(Boolean)
                          .join(" ") ||
                        contact.email ||
                        contact.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadPreviewContacts}
                  disabled={
                    !effectiveAccountKey || previewContactsLoading
                  }
                  className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-40"
                  title={
                    effectiveAccountKey
                      ? "Refresh contacts"
                      : "Switch to a connected account to load contacts"
                  }
                >
                  <ArrowPathIcon
                    className={`w-3.5 h-3.5 ${previewContactsLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
              {previewLoading && (
                <span className="text-[10px] text-amber-400 ml-1">Compiling...</span>
              )}
              {missingPreviewVars.length > 0 && (
                <div className="relative ml-1">
                  <button
                    onClick={() => setShowMissingVars(!showMissingVars)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title={`${missingPreviewVars.length} variable${missingPreviewVars.length === 1 ? "" : "s"} missing data`}
                  >
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold">
                      {missingPreviewVars.length}
                    </span>
                  </button>
                  {showMissingVars && (
                    <div className="absolute left-0 top-full mt-1 z-50 w-72 glass-dropdown">
                      <div className="px-3 py-2 border-b border-[var(--border)] bg-amber-500/5 flex items-center justify-between">
                        <p className="text-xs font-semibold text-amber-400">
                          Missing Preview Data
                        </p>
                        <button
                          onClick={() => setShowMissingVars(false)}
                          className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                        {missingPreviewVars.map((varName) => (
                          <div
                            key={varName}
                            className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--background)]"
                          >
                            <span className="text-[10px] font-mono text-amber-300">{`{{${varName}}}`}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--muted)]/30">
                        <p className="text-[10px] text-[var(--muted-foreground)]">
                          These variables will show as blank in the email. Select
                          a contact with this data or set values in Settings.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Center — Desktop / Mobile toggle */}
            <div className="flex-1 flex items-center justify-center gap-1">
              <button
                onClick={() => setPreviewWidth("desktop")}
                className={`p-1.5 rounded ${previewWidth === "desktop" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                title="Desktop"
              >
                <ComputerDesktopIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPreviewWidth("mobile")}
                className={`p-1.5 rounded ${previewWidth === "mobile" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                title="Mobile (375px)"
              >
                <DevicePhoneMobileIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Right — Copy dropdown + Undo/Redo */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
                title="Undo (⌘Z)"
              >
                <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
                title="Redo (⌘⇧Z)"
              >
                <ArrowUturnRightIcon className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-5 bg-[var(--border)] mx-0.5" />
              <div className="relative" data-copy-dropdown>
                <button
                  onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                  disabled={!previewHtml}
                  className={`p-1.5 rounded-lg transition-colors ${copied ? "text-green-400 bg-green-500/10" : "hover:bg-[var(--muted)] disabled:opacity-40"}`}
                  title="Copy HTML"
                >
                  {copied ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <Square2StackIcon className="w-4 h-4" />
                  )}
                </button>
                {showCopyDropdown && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 glass-dropdown">
                    <button
                      onClick={() => handleCopyHtml("compiled")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--accent)] transition-colors text-left"
                    >
                      <CodeBracketIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      Compiled HTML
                    </button>
                    <button
                      onClick={() => handleCopyHtml("source")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--accent)] transition-colors text-left"
                    >
                      <Square2StackIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      Source Template
                    </button>
                    <button
                      onClick={() => handleCopyHtml("text")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--accent)] transition-colors text-left"
                    >
                      <DocumentArrowDownIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      Plain Text
                    </button>
                  </div>
                )}
              </div>
              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className={`p-1.5 rounded-lg transition-colors ${saving ? "text-amber-400 bg-amber-500/10" : "hover:bg-[var(--muted)] disabled:opacity-40"}`}
                title="Save (⌘S)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="currentColor" className={`w-4 h-4 ${saving ? "animate-pulse" : ""}`}><path d="M 7 4 C 5.3545455 4 4 5.3545455 4 7 L 4 43 C 4 44.645455 5.3545455 46 7 46 L 43 46 C 44.645455 46 46 44.645455 46 43 L 46 13.199219 A 1.0001 1.0001 0 0 0 45.707031 12.492188 L 37.507812 4.2929688 A 1.0001 1.0001 0 0 0 36.800781 4 L 7 4 z M 7 6 L 12 6 L 12 18 C 12 19.645455 13.354545 21 15 21 L 34 21 C 35.645455 21 37 19.645455 37 18 L 37 6.6132812 L 44 13.613281 L 44 43 C 44 43.554545 43.554545 44 43 44 L 38 44 L 38 29 C 38 27.354545 36.645455 26 35 26 L 15 26 C 13.354545 26 12 27.354545 12 29 L 12 44 L 7 44 C 6.4454545 44 6 43.554545 6 43 L 6 7 C 6 6.4454545 6.4454545 6 7 6 z M 14 6 L 35 6 L 35 18 C 35 18.554545 34.554545 19 34 19 L 15 19 C 14.445455 19 14 18.554545 14 18 L 14 6 z M 29 8 A 1.0001 1.0001 0 0 0 28 9 L 28 16 A 1.0001 1.0001 0 0 0 29 17 L 32 17 A 1.0001 1.0001 0 0 0 33 16 L 33 9 A 1.0001 1.0001 0 0 0 32 8 L 29 8 z M 30 10 L 31 10 L 31 15 L 30 15 L 30 10 z M 15 28 L 35 28 C 35.554545 28 36 28.445455 36 29 L 36 44 L 14 44 L 14 29 C 14 28.445455 14.445455 28 15 28 z"/></svg>
              </button>
              {/* Refresh preview */}
              <button
                onClick={() => compilePreview(code)}
                disabled={previewLoading}
                className="p-1.5 rounded-lg hover:bg-[var(--muted)] disabled:opacity-40 transition-colors"
                title="Refresh preview"
              >
                <ArrowPathIcon
                  className={`w-4 h-4 ${previewLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-zinc-700 flex justify-center">
            {previewError ? (
              <div className="max-w-md mx-auto p-6 text-center mt-8">
                <p className="text-red-400 text-sm font-medium mb-2">
                  Preview Error
                </p>
                <p className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
                  {previewError}
                </p>
              </div>
            ) : previewHtml ? (
              <div
                className="transition-all duration-200 ease-in-out"
                style={{
                  width: previewWidth === "mobile" ? "375px" : "100%",
                  maxWidth: previewWidth === "mobile" ? "375px" : "100%",
                }}
              >
                <iframe
                  ref={iframeRef}
                  key={`${previewKeyRef.current}-${previewWidth}`}
                  srcDoc={previewHtml}
                  className="w-full border-0 block mx-auto"
                  style={{
                    minHeight: "100vh",
                  }}
                  title="Email preview"
                  sandbox="allow-same-origin"
                  onLoad={handleIframeLoad}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm mt-8">
                <ArrowPathIcon className="w-8 h-8 mx-auto mb-3 animate-spin" />
                <p>Loading preview...</p>
              </div>
            )}
          </div>
        </div>

        {showAiAssistant && (
          <div className="relative w-[360px] flex-shrink-0 flex flex-col rounded-xl overflow-hidden ai-ed-panel animate-slide-in-right">
            <div className="pointer-events-none absolute inset-0 ai-ed-glow" />
            <div className="relative z-10 flex h-full flex-col">
              {/* Header */}
              <div className="px-4 py-2.5 border-b border-[var(--ai-ed-accent)] ai-ed-header flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <SparklesIcon className="w-4 h-4 text-[var(--ai-ed-text-muted)] drop-shadow-[0_0_12px_rgba(236,72,153,0.5)]" />
                  <p className="text-xs font-semibold text-[var(--ai-ed-text)]">
                    AI Assistant
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {aiHistory.length > 0 && (
                    <button
                      onClick={() => {
                        setAiHistory([]);
                        setAiReply("");
                        setAiSuggestions([]);
                        setAiComponentEdits([]);
                        setAiError("");
                      }}
                      className="p-1 rounded-lg text-[var(--ai-ed-text-faint)] hover:text-[var(--ai-ed-text)] hover:bg-[var(--ai-ed-hover)] transition-colors"
                      title="Clear conversation"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowAiAssistant(false)}
                    className="p-1 rounded-lg text-[var(--ai-ed-text-muted)] hover:text-[var(--ai-ed-text)] hover:bg-[var(--ai-ed-hover)] transition-colors"
                    title="Close AI assistant"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Context bar */}
              <div className="px-3 py-2 border-b border-[var(--ai-ed-accent)] bg-[var(--ai-ed-card)] backdrop-blur-[1px] flex items-center gap-2">
                {selectedEditorComponent ? (
                  <p className="text-[10px] text-[var(--ai-ed-text-muted)] truncate">
                    <span className="text-[var(--ai-ed-text)] font-medium">
                      Section {selectedEditorComponent.index + 1}:
                    </span>{" "}
                    {selectedEditorComponent.label} &middot;{" "}
                    {Object.keys(selectedEditorComponent.props).length} prop
                    {Object.keys(selectedEditorComponent.props).length === 1
                      ? ""
                      : "s"}
                  </p>
                ) : (
                  <p className="text-[10px] text-[var(--ai-ed-text-faint)]">
                    Select a section for prop-level suggestions
                  </p>
                )}
              </div>

              {/* Conversation thread */}
              <div
                ref={aiScrollRef}
                className="flex-1 overflow-y-auto p-3 space-y-3 bg-[var(--ai-ed-thread)]"
              >
                {/* Welcome / empty state */}
                {aiHistory.length === 0 && !aiLoading && (
                  <div className="space-y-3">
                    <div className="border border-dashed border-[var(--ai-ed-accent)] rounded-lg p-3 text-center bg-[var(--ai-ed-card)]">
                      <SparklesIcon className="w-5 h-5 mx-auto text-[var(--ai-ed-text-faint)] mb-1.5" />
                      <p className="text-xs text-[var(--ai-ed-text-muted)]">
                        Ask for subject lines, CTA rewrites, body copy, or prop
                        tweaks.
                      </p>
                    </div>
                    {/* Preset quick actions */}
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "Write 5 subject lines",
                        "Improve the CTA copy",
                        "Shorten the body copy",
                        "Make it more urgent",
                        "Suggest a preheader",
                      ].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            setAiPrompt(preset);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium border border-[var(--ai-ed-accent)] text-[var(--ai-ed-text-muted)] bg-[var(--ai-ed-card)] hover:bg-[var(--ai-ed-hover)] hover:text-[var(--ai-ed-text)] transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message history */}
                {aiHistory.map((msg, idx) => (
                  <div key={`ai-msg-${idx}`}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] bg-[var(--ai-ed-user-msg)] border border-[var(--ai-ed-accent)] rounded-lg rounded-br-sm px-3 py-2">
                          <p className="text-xs text-[var(--ai-ed-text)] whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Reply text */}
                        {msg.content && (
                          <div className="border border-[var(--ai-ed-accent)] rounded-lg rounded-bl-sm p-2.5 bg-[var(--ai-ed-card)] backdrop-blur-sm">
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--ai-ed-text)]">
                              {msg.content}
                            </p>
                          </div>
                        )}
                        {/* Suggestions */}
                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="border border-[var(--ai-ed-accent)] rounded-lg p-2.5 bg-[var(--ai-ed-card)]">
                            <p className="text-[10px] uppercase tracking-wider text-[var(--ai-ed-text-muted)] mb-2">
                              Suggestions
                            </p>
                            <div className="space-y-1.5">
                              {msg.suggestions.map((suggestion, sIdx) => (
                                <div
                                  key={`${suggestion}-${sIdx}`}
                                  className="flex items-start gap-2 bg-[var(--ai-ed-deep)] border border-[var(--ai-ed-accent)] rounded-md px-2 py-1.5"
                                >
                                  <p className="text-xs flex-1 text-[var(--ai-ed-text)]">
                                    {suggestion}
                                  </p>
                                  <button
                                    onClick={() =>
                                      handleCopySuggestion(suggestion)
                                    }
                                    className="p-1 rounded text-[var(--ai-ed-text-muted)] hover:text-[var(--ai-ed-text)] hover:bg-[var(--ai-ed-hover)] transition-colors"
                                    title="Copy suggestion"
                                  >
                                    {copiedSuggestion === suggestion ? (
                                      <CheckIcon className="w-3.5 h-3.5 text-green-400" />
                                    ) : (
                                      <Square2StackIcon className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Component edits (only show on the latest assistant message) */}
                        {msg.componentEdits &&
                          msg.componentEdits.length > 0 &&
                          idx === aiHistory.length - 1 && (
                            <div className="border border-[var(--ai-ed-accent)] rounded-lg p-2.5 bg-[var(--ai-ed-card)]">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--ai-ed-text-muted)]">
                                  Prop Edits
                                </p>
                                <button
                                  onClick={() =>
                                    applyAiEdits(msg.componentEdits!)
                                  }
                                  disabled={selectedComponent === null}
                                  className="px-2 py-1 rounded-md text-[10px] font-semibold text-white bg-gradient-to-r from-orange-500/90 to-fuchsia-500/90 shadow-[0_6px_14px_rgba(45,212,191,0.18)] hover:brightness-110 disabled:opacity-40 transition-all"
                                >
                                  Apply All
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                {msg.componentEdits.map((edit, eIdx) => (
                                  <div
                                    key={`${edit.key}-${eIdx}`}
                                    className="border border-[var(--ai-ed-accent)] rounded-md p-2 bg-[var(--ai-ed-deep)]"
                                  >
                                    <p className="text-[11px] font-medium text-[var(--ai-ed-text)]">
                                      {edit.key}
                                    </p>
                                    <p className="text-xs mt-1 whitespace-pre-wrap text-[var(--ai-ed-text)]">
                                      {edit.value}
                                    </p>
                                    {edit.reason && (
                                      <p className="text-[10px] text-[var(--ai-ed-text-muted)] mt-1">
                                        {edit.reason}
                                      </p>
                                    )}
                                    <button
                                      onClick={() => applyAiEdits([edit])}
                                      disabled={selectedComponent === null}
                                      className="mt-2 px-2 py-1 rounded-md text-[10px] font-semibold text-white bg-gradient-to-r from-orange-500/90 to-fuchsia-500/90 shadow-[0_6px_14px_rgba(45,212,191,0.18)] hover:brightness-110 disabled:opacity-40 transition-all"
                                    >
                                      Apply
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {aiLoading && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="flex gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--ai-ed-dot)] animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--ai-ed-dot)] animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--ai-ed-dot)] animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <p className="text-[10px] text-[var(--ai-ed-text-faint)]">Thinking...</p>
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="p-3 border-t border-[var(--ai-ed-accent)] bg-[var(--ai-ed-footer)] space-y-2">
                {aiError && (
                  <p className="text-xs text-amber-300 mb-1">{aiError}</p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAskAssistant();
                      }
                    }}
                    placeholder="Ask anything..."
                    rows={2}
                    className="flex-1 bg-[var(--ai-ed-input)] border border-[var(--ai-ed-accent)] rounded-lg px-3 py-2 text-xs text-[var(--ai-ed-text)] placeholder:text-[var(--ai-ed-text-faint)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ai-ed-focus)]"
                  />
                  <button
                    onClick={handleAskAssistant}
                    disabled={aiLoading || !aiPrompt.trim()}
                    className="p-2.5 rounded-lg text-white bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 shadow-[0_8px_20px_rgba(45,212,191,0.35)] hover:brightness-110 disabled:opacity-40 transition-all flex-shrink-0"
                    title="Send"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-overlay-in"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="glass-modal w-[980px] h-[78vh] max-h-[780px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Template History</h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Last 5 saved versions for {designLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadTemplateHistory}
                  disabled={historyLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
                >
                  <ArrowPathIcon
                    className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex">
              <div className="w-[320px] border-r border-[var(--border)] overflow-y-auto p-2 space-y-1.5">
                {historyLoading ? (
                  <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">
                    Loading history...
                  </p>
                ) : historyVersions.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">
                    No saved versions yet.
                  </p>
                ) : (
                  historyVersions.map((version) => {
                    const selected = selectedHistoryVersion?.id === version.id;
                    return (
                      <div
                        key={version.id}
                        className={`border rounded-lg p-2.5 transition-colors ${selected ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)] bg-[var(--background)]"}`}
                      >
                        <button
                          onClick={() => loadHistoryVersion(version)}
                          className="w-full text-left"
                        >
                          <p className="text-xs font-medium">
                            {formatHistoryDate(version.createdAt)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {version.createdBy && (
                              <span className="text-[10px] text-[var(--muted-foreground)]">
                                {version.createdBy}
                              </span>
                            )}
                            {version.createdBy && <span className="text-[10px] text-[var(--muted-foreground)] opacity-40">·</span>}
                            <span className="text-[10px] text-[var(--muted-foreground)]">
                              {formatBytes(version.size)}
                            </span>
                          </div>
                        </button>
                        <button
                          onClick={() => handleRestoreVersion(version.id)}
                          disabled={restoringVersionId === version.id}
                          className="mt-2 w-full text-center px-2 py-1.5 rounded-md text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
                        >
                          {restoringVersionId === version.id
                            ? "Restoring..."
                            : "Restore"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {!selectedHistoryVersion && (
                  <div className="h-full flex items-center justify-center text-center">
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Select a version to compare against your current editor
                      content.
                    </p>
                  </div>
                )}

                {selectedHistoryVersion && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Comparing with{" "}
                          {formatHistoryDate(selectedHistoryVersion.createdAt)}
                        </p>
                        {!historyCompareLoading && (
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {historyDiff.length} changed line
                            {historyDiff.length === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </div>

                    {historyCompareLoading ? (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Loading version...
                      </p>
                    ) : historyDiff.length === 0 ? (
                      <div className="p-4 border border-[var(--border)] rounded-lg bg-[var(--background)]">
                        <p className="text-sm text-[var(--muted-foreground)]">
                          No differences from current editor content.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                        <div className="grid grid-cols-[76px_1fr_1fr] gap-0 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--muted)] border-b border-[var(--border)]">
                          <div className="px-2 py-1.5">Line</div>
                          <div className="px-2 py-1.5 border-l border-[var(--border)]">
                            Snapshot
                          </div>
                          <div className="px-2 py-1.5 border-l border-[var(--border)]">
                            Current
                          </div>
                        </div>
                        <div className="max-h-[480px] overflow-auto font-mono text-xs">
                          {historyDiff.slice(0, 240).map((row) => (
                            <div
                              key={`${row.line}-${row.kind}-${row.snapshot}-${row.current}`}
                              className="grid grid-cols-[76px_1fr_1fr] gap-0 border-b border-[var(--border)] last:border-b-0"
                            >
                              <div className="px-2 py-1.5 text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)]/40">
                                {row.line}
                              </div>
                              <div
                                className={`px-2 py-1.5 border-l border-[var(--border)] whitespace-pre-wrap break-words ${row.kind === "added" ? "bg-transparent" : "bg-red-500/10"}`}
                              >
                                {row.snapshot || (
                                  <span className="opacity-40">
                                    &lt;empty&gt;
                                  </span>
                                )}
                              </div>
                              <div
                                className={`px-2 py-1.5 border-l border-[var(--border)] whitespace-pre-wrap break-words ${row.kind === "removed" ? "bg-transparent" : "bg-green-500/10"}`}
                              >
                                {row.current || (
                                  <span className="opacity-40">
                                    &lt;empty&gt;
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          {historyDiff.length > 240 && (
                            <div className="px-3 py-2 text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)]/30">
                              Showing first 240 changed lines.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Picker Modal */}
      {showComponentPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-overlay-in"
          onClick={() => setShowComponentPicker(false)}
        >
          <div
            className="glass-modal w-[420px] max-h-[520px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Section Library</h3>
                <button
                  onClick={() => setShowComponentPicker(false)}
                  className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              {/* Tag filter pills */}
              {sectionTags && sectionTags.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FunnelIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
                  <button
                    onClick={() => setPickerTag("all")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                      pickerTag === "all"
                        ? "border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]"
                    }`}
                  >
                    All
                  </button>
                  {sectionTags.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setPickerTag(tag)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        pickerTag === tag
                          ? "border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {(() => {
                const filtered = getAvailableComponents().filter((schema) => {
                  // Only allow one footer per template
                  if (
                    FOOTER_TYPES.has(schema.name) &&
                    parsed?.components.some((c) => FOOTER_TYPES.has(c.type))
                  ) {
                    return false;
                  }
                  // Tag filter
                  if (pickerTag !== "all" && sectionTags) {
                    const assigned = sectionTags.assignments[schema.name] || [];
                    if (!assigned.includes(pickerTag)) return false;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-8 text-sm text-[var(--muted-foreground)]">
                      <p>No sections match this tag</p>
                      <button
                        onClick={() => setPickerTag("all")}
                        className="text-[var(--primary)] hover:underline text-xs mt-1"
                      >
                        Browse all
                      </button>
                    </div>
                  );
                }

                return filtered.map((schema) => (
                  <button
                    key={schema.name}
                    onClick={() => handleAddComponent(schema.name)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--muted)] rounded-lg transition-colors"
                  >
                    <ComponentIcon
                      name={schema.icon}
                      className="w-5 h-5 text-[var(--muted-foreground)]"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{schema.label}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">
                        {schema.props.length} props
                      </div>
                    </div>
                    <PlusIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="glass-modal w-[480px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <QuestionMarkCircleIcon className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {[
                {
                  group: "General",
                  shortcuts: [
                    { keys: ["Cmd", "S"], label: "Save template" },
                    {
                      keys: ["Cmd", "Shift", "E"],
                      label: "Toggle code / visual mode",
                    },
                    { keys: ["Cmd", "Z"], label: "Undo (visual mode)" },
                    {
                      keys: ["Cmd", "Shift", "Z"],
                      label: "Redo (visual mode)",
                    },
                    { keys: ["Esc"], label: "Close modal / panel" },
                    { keys: ["?"], label: "Show this help" },
                  ],
                },
                {
                  group: "Preview & Tools",
                  shortcuts: [
                    { keys: ["Cmd", "Shift", "P"], label: "Refresh preview" },
                    {
                      keys: ["Cmd", "Shift", "A"],
                      label: "Toggle AI assistant",
                    },
                    {
                      keys: ["Cmd", "Shift", "H"],
                      label: "Open version history",
                    },
                  ],
                },
              ].map((section) => (
                <div key={section.group}>
                  <h4 className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                    {section.group}
                  </h4>
                  <div className="space-y-1.5">
                    {section.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.label}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-xs text-[var(--foreground)]">
                          {shortcut.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key) => (
                            <kbd
                              key={key}
                              className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] text-[10px] font-mono text-[var(--muted-foreground)] min-w-[24px] text-center"
                            >
                              {key === "Cmd"
                                ? typeof navigator !== "undefined" &&
                                  navigator.platform?.includes("Mac")
                                  ? "\u2318"
                                  : "Ctrl"
                                : key === "Shift"
                                  ? "\u21E7"
                                  : key === "Esc"
                                    ? "Esc"
                                    : key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
          onClick={() => !savingTemplate && setShowSaveTemplateModal(false)}
        >
          <div
            className="glass-modal w-[440px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="currentColor" className="w-4 h-4 text-[var(--primary)]"><path d="M 7 4 C 5.3545455 4 4 5.3545455 4 7 L 4 43 C 4 44.645455 5.3545455 46 7 46 L 43 46 C 44.645455 46 46 44.645455 46 43 L 46 13.199219 A 1.0001 1.0001 0 0 0 45.707031 12.492188 L 37.507812 4.2929688 A 1.0001 1.0001 0 0 0 36.800781 4 L 7 4 z M 7 6 L 12 6 L 12 18 C 12 19.645455 13.354545 21 15 21 L 34 21 C 35.645455 21 37 19.645455 37 18 L 37 6.6132812 L 44 13.613281 L 44 43 C 44 43.554545 43.554545 44 43 44 L 38 44 L 38 29 C 38 27.354545 36.645455 26 35 26 L 15 26 C 13.354545 26 12 27.354545 12 29 L 12 44 L 7 44 C 6.4454545 44 6 43.554545 6 43 L 6 7 C 6 6.4454545 6.4454545 6 7 6 z M 14 6 L 35 6 L 35 18 C 35 18.554545 34.554545 19 34 19 L 15 19 C 14.445455 19 14 18.554545 14 18 L 14 6 z M 29 8 A 1.0001 1.0001 0 0 0 28 9 L 28 16 A 1.0001 1.0001 0 0 0 29 17 L 32 17 A 1.0001 1.0001 0 0 0 33 16 L 33 9 A 1.0001 1.0001 0 0 0 32 8 L 29 8 z M 30 10 L 31 10 L 31 15 L 30 15 L 30 10 z M 15 28 L 35 28 C 35.554545 28 36 28.445455 36 29 L 36 44 L 14 44 L 14 29 C 14 28.445455 14.445455 28 15 28 z"/></svg>
                <h3 className="text-sm font-semibold">Save Template</h3>
              </div>
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                disabled={savingTemplate}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-40"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--muted-foreground)]">
                Your template will always be saved on Loomi. Optionally, also publish it to your connected integration{connectedProviders.length > 1 ? "s" : ""}.
              </p>

              {/* Save to Template Library — admin/developer only */}
              {isAdmin && (
                <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={saveToLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                    className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <BookOpenIcon className="w-5 h-5 text-[var(--primary)]" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block">Save to Template Library</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">Make available for all accounts</span>
                  </div>
                  {saveToLibraryResult && (
                    <span className={`ml-auto text-[10px] font-medium ${saveToLibraryResult.success ? "text-green-400" : "text-red-400"}`}>
                      {saveToLibraryResult.success ? "✓ Added" : saveToLibraryResult.error || "Failed"}
                    </span>
                  )}
                </label>
              )}

              {connectedProviders.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--muted-foreground)]">
                    Also publish to:
                  </label>
                  {connectedProviders.map((provider) => {
                    const meta = PROVIDER_META[provider];
                    return (
                      <label
                        key={provider}
                        className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={saveTemplateProviders[provider] ?? false}
                          onChange={(e) =>
                            setSaveTemplateProviders((prev) => ({
                              ...prev,
                              [provider]: e.target.checked,
                            }))
                          }
                          className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                        />
                        {meta?.iconSrc && (
                          <img
                            src={meta.iconSrc}
                            alt={meta.displayName}
                            className="w-5 h-5 rounded"
                          />
                        )}
                        <span className="text-sm font-medium">
                          {meta?.displayName || provider}
                        </span>
                        {saveTemplateResults?.[provider] && (
                          <span className={`ml-auto text-[10px] font-medium ${saveTemplateResults[provider].success ? "text-green-400" : "text-red-400"}`}>
                            {saveTemplateResults[provider].success ? "✓ Published" : saveTemplateResults[provider].error || "Failed"}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 space-y-2">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    No integrations connected. The template will be saved on Loomi only.
                  </p>
                  <Link
                    href={effectiveAccountKey ? `/accounts/${effectiveAccountKey}?tab=integrations` : "/settings"}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline"
                  >
                    <LinkIcon className="w-3 h-3" />
                    Set up integrations
                  </Link>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                disabled={savingTemplate}
                className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="currentColor" className="w-3.5 h-3.5"><path d="M 7 4 C 5.3545455 4 4 5.3545455 4 7 L 4 43 C 4 44.645455 5.3545455 46 7 46 L 43 46 C 44.645455 46 46 44.645455 46 43 L 46 13.199219 A 1.0001 1.0001 0 0 0 45.707031 12.492188 L 37.507812 4.2929688 A 1.0001 1.0001 0 0 0 36.800781 4 L 7 4 z M 7 6 L 12 6 L 12 18 C 12 19.645455 13.354545 21 15 21 L 34 21 C 35.645455 21 37 19.645455 37 18 L 37 6.6132812 L 44 13.613281 L 44 43 C 44 43.554545 43.554545 44 43 44 L 38 44 L 38 29 C 38 27.354545 36.645455 26 35 26 L 15 26 C 13.354545 26 12 27.354545 12 29 L 12 44 L 7 44 C 6.4454545 44 6 43.554545 6 43 L 6 7 C 6 6.4454545 6.4454545 6 7 6 z M 14 6 L 35 6 L 35 18 C 35 18.554545 34.554545 19 34 19 L 15 19 C 14.445455 19 14 18.554545 14 18 L 14 6 z M 29 8 A 1.0001 1.0001 0 0 0 28 9 L 28 16 A 1.0001 1.0001 0 0 0 29 17 L 32 17 A 1.0001 1.0001 0 0 0 33 16 L 33 9 A 1.0001 1.0001 0 0 0 32 8 L 29 8 z M 30 10 L 31 10 L 31 15 L 30 15 L 30 10 z M 15 28 L 35 28 C 35.554545 28 36 28.445455 36 29 L 36 44 L 14 44 L 14 29 C 14 28.445455 14.445455 28 15 28 z"/></svg>
                {savingTemplate
                  ? "Saving..."
                  : Object.values(saveTemplateProviders).some(Boolean)
                    ? "Save & Publish"
                    : saveToLibrary
                      ? "Save & Add to Library"
                      : "Save on Loomi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Test Email Modal */}
      {showSendTest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-overlay-in"
          onClick={() => setShowSendTest(false)}
        >
          <div
            className="glass-modal w-[440px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold">Send Test Email</h3>
              </div>
              <button
                onClick={() => setShowSendTest(false)}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1.5">
                  To
                </label>
                <input
                  type="email"
                  value={sendTestTo}
                  onChange={(e) => setSendTestTo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendTest()}
                  className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
                  placeholder="you@example.com (comma-separate for multiple)"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={sendTestSubject}
                  onChange={(e) => setSendTestSubject(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendTest()}
                  className="w-full text-sm bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
                  placeholder="Subject line..."
                />
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)]">
                Sends the compiled preview HTML with current preview data.
                Subject will be prefixed with [TEST].
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30">
              <button
                onClick={() => setShowSendTest(false)}
                className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendTest}
                disabled={!sendTestTo.trim() || sendingTest}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                <EnvelopeIcon className="w-3.5 h-3.5" />
                {sendingTest ? "Sending..." : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Picker Modal */}
      {mediaPickerOpen && canBrowseMedia && (
        <MediaPickerModal
          accountKey={mediaPickerAccountKey}
          onSelect={handleMediaSelect}
          onClose={() => {
            setMediaPickerOpen(false);
            setMediaPickerComponentIdx(null);
            setMediaPickerPropKey(null);
          }}
        />
      )}
    </div>
  );
}
