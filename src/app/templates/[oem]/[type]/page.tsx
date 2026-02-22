"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  CodeBracketIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
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
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  EnvelopeIcon,
  QuestionMarkCircleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import Link from "next/link";
import { useAccount } from "@/contexts/account-context";
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

type EditorMode = "code" | "visual";
type VisualTab = "settings" | "components";

interface TemplateHistoryVersion {
  id: string;
  createdAt: string;
  size: number;
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

// A single input with a "px" suffix badge, hover arrows, and drag-to-adjust
function DraggableUnitInput({
  value,
  placeholder,
  onChange,
  disabled,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragStartValue = useRef<number>(0);
  const hasDragged = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const getNumeric = () =>
    parseInt(stripUnit(value) || stripUnit(placeholder) || "0", 10) || 0;

  const adjustValue = (delta: number) => {
    if (disabled) return;
    const newVal = Math.max(0, getNumeric() + delta);
    onChange(String(newVal));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    if (disabled) return;
    dragStartY.current = e.clientY;
    dragStartValue.current = getNumeric();
    hasDragged.current = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragStartY.current === null) return;
      const dy = dragStartY.current - moveEvent.clientY;
      if (!hasDragged.current && Math.abs(dy) < 3) return;
      hasDragged.current = true;
      if (!isDragging) setIsDragging(true);
      const step = moveEvent.shiftKey ? 10 : 1;
      const newVal = Math.max(0, dragStartValue.current + dy * step);
      onChange(String(newVal));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartY.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (!hasDragged.current) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      className="relative group"
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        ref={inputRef}
        type="text"
        value={stripUnit(value)}
        placeholder={stripUnit(placeholder) || "0"}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        onMouseDown={handleMouseDown}
        disabled={disabled}
        className={`${className || ""} ${!disabled ? "cursor-ns-resize" : ""}`}
      />
      {!disabled && isHovered && !isDragging && (
        <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col">
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
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--muted-foreground)] pointer-events-none font-mono">
        px
      </span>
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

  const inputClass = `w-full bg-[var(--input)] border border-[var(--border)] rounded-lg pl-2 pr-5 py-1.5 text-xs text-center font-mono ${isUsingDefault ? "text-[var(--muted-foreground)]" : ""}`;

  // 2×2 grid: Row 1 = Top, Right | Row 2 = Bottom, Left
  const gridCells: {
    key: "top" | "right" | "bottom" | "left";
    label: string;
    idx: number;
  }[] = [
    { key: "top", label: "Top", idx: 0 },
    { key: "right", label: "Right", idx: 1 },
    { key: "bottom", label: "Bottom", idx: 2 },
    { key: "left", label: "Left", idx: 3 },
  ];

  return (
    <div className="flex items-center gap-2 max-w-[200px]">
      {linked ? (
        <DraggableUnitInput
          value={isUsingDefault ? "" : sides.top}
          placeholder={placeholderSides.top}
          onChange={(val) => handleSideChange("top", val)}
          className={inputClass}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-0">
          {gridCells.map((cell) => (
            <div key={cell.key}>
              <label className="text-[9px] text-[var(--muted-foreground)] uppercase block text-center mb-0.5">
                {cell.label}
              </label>
              <DraggableUnitInput
                value={isUsingDefault ? "" : sides[cell.key]}
                placeholder={placeholderSides[cell.key]}
                onChange={(val) => handleSideChange(cell.key, val)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}
      <button
        onClick={toggleLinked}
        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors flex-shrink-0 ${linked ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"}`}
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

  const inputClass = `w-full bg-[var(--input)] border border-[var(--border)] rounded-lg pl-2 pr-5 py-1.5 text-xs text-center font-mono ${isUsingDefault ? "text-[var(--muted-foreground)]" : ""}`;

  // 2×2 grid: Row 1 = TL, TR | Row 2 = BL, BR
  const gridCells: {
    key: "tl" | "tr" | "bl" | "br";
    label: string;
    idx: number;
  }[] = [
    { key: "tl", label: "TL", idx: 0 },
    { key: "tr", label: "TR", idx: 1 },
    { key: "bl", label: "BL", idx: 2 },
    { key: "br", label: "BR", idx: 3 },
  ];

  return (
    <div className="flex items-center gap-2 max-w-[200px]">
      {linked ? (
        <DraggableUnitInput
          value={isUsingDefault ? "" : corners.tl}
          placeholder={placeholderCorners.tl}
          onChange={(val) => handleCornerChange("tl", val)}
          className={inputClass}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-0">
          {gridCells.map((cell) => (
            <div key={cell.key}>
              <label className="text-[9px] text-[var(--muted-foreground)] uppercase block text-center mb-0.5">
                {cell.label}
              </label>
              <DraggableUnitInput
                value={isUsingDefault ? "" : corners[cell.key]}
                placeholder={placeholderCorners[cell.key]}
                onChange={(val) => handleCornerChange(cell.key, val)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}
      <button
        onClick={toggleLinked}
        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors flex-shrink-0 ${linked ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"}`}
        title={linked ? "Unlink corners" : "Link all corners"}
      >
        <LinkIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// Render a single form field
function PropField({
  prop,
  value,
  onChange,
  onLiveStyle,
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
    // Single value with px suffix
    return (
      <div className="relative max-w-[75px]">
        <input
          type="text"
          value={value ? stripUnit(value) : ""}
          placeholder={stripUnit(placeholderText || "") || "0"}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw ? ensureUnit(raw) : "");
          }}
          onWheel={(e) => e.currentTarget.blur()}
          className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg pl-3 pr-7 py-1.5 text-sm font-mono"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)] pointer-events-none font-mono">
          px
        </span>
      </div>
    );
  }
  if (prop.type === "color") {
    return (
      <div className="flex items-center bg-[var(--input)] border border-[var(--border)] rounded-lg overflow-hidden">
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
          className="flex-1 bg-transparent border-none px-2 py-1.5 text-sm font-mono outline-none"
          placeholder={placeholderText || "#000000"}
        />
      </div>
    );
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
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm resize-none"
        placeholder={placeholderText}
      />
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

// --- Component props renderer with repeatable group support ---
function ComponentPropsRenderer({
  schema,
  props: compProps,
  allSchemaProps,
  onPropChange,
  onLiveStyle,
}: {
  schema: { repeatableGroups?: RepeatableGroup[] };
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
  }[];
  onPropChange: (key: string, val: string) => void;
  onLiveStyle?: (key: string, val: string) => void;
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
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < propsToRender.length) {
      const prop = propsToRender[i];
      const nextProp = propsToRender[i + 1];
      if (prop.half && nextProp?.half) {
        elements.push(
          <div key={`${prop.key}-${nextProp.key}`} className="flex gap-2">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                {prop.label}
              </label>
              <PropField
                prop={prop}
                value={compProps[prop.key] || ""}
                onChange={(val) => onPropChange(prop.key, val)}
                onLiveStyle={
                  onLiveStyle ? (val) => onLiveStyle(prop.key, val) : undefined
                }
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                {nextProp.label}
              </label>
              <PropField
                prop={nextProp}
                value={compProps[nextProp.key] || ""}
                onChange={(val) => onPropChange(nextProp.key, val)}
                onLiveStyle={
                  onLiveStyle
                    ? (val) => onLiveStyle(nextProp.key, val)
                    : undefined
                }
              />
            </div>
          </div>,
        );
        i += 2;
      } else {
        elements.push(
          <div key={prop.key}>
            <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
              {prop.label}
            </label>
            <PropField
              prop={prop}
              value={compProps[prop.key] || ""}
              onChange={(val) => onPropChange(prop.key, val)}
              onLiveStyle={
                onLiveStyle ? (val) => onLiveStyle(prop.key, val) : undefined
              }
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

  // Build sections — each batch of standard props or repeatable group becomes a section
  const sections: React.ReactNode[] = [];
  const renderedGroups = new Set<string>();
  const standardBuffer: typeof allSchemaProps = [];
  let sectionIdx = 0;

  const flushStandardBuffer = () => {
    if (standardBuffer.length > 0) {
      const batch = [...standardBuffer];
      sections.push(
        <div key={`std-${sectionIdx++}`} className="space-y-3">
          {renderStandardProps(batch)}
        </div>,
      );
      standardBuffer.length = 0;
    }
  };

  for (const prop of allSchemaProps) {
    if (prop.repeatableGroup) {
      if (!renderedGroups.has(prop.repeatableGroup)) {
        flushStandardBuffer();
        renderedGroups.add(prop.repeatableGroup);
        const group = groups.find((g) => g.key === prop.repeatableGroup);
        if (group) {
          if (isNumberedGroup(group)) {
            sections.push(renderNumberedGroup(group));
          } else {
            sections.push(renderNonNumberedGroup(group));
          }
        }
      }
    } else {
      standardBuffer.push(prop);
    }
  }
  flushStandardBuffer();

  return <div className="space-y-4">{sections}</div>;
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

// Settings sections with static defaults (no theme system)
const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: "Email Meta",
    key: "meta",
    fields: [
      { key: "fm:title", label: "Title", type: "text", target: "frontmatter" },
      {
        key: "fm:preheader",
        label: "Preheader",
        type: "text",
        target: "frontmatter",
      },
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
        key: "bg-color",
        label: "Button Color",
        type: "color",
        target: "ctaComponents",
        placeholder: "#000000",
        half: true,
      },
      {
        key: "text-color",
        label: "Text Color",
        type: "color",
        target: "ctaComponents",
        placeholder: "#ffffff",
        half: true,
      },
      {
        key: "radius",
        label: "Button Radius",
        type: "radius",
        target: "ctaComponents",
        placeholder: "0",
      },
      {
        key: "padding",
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
    lines.push("");
    lines.push(`  <div data-loomi="${i}" style="display:none"></div>`);
    lines.push(...serializeComponent(comp, "  "));
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

  for (const comp of template.components) {
    lines.push("");
    lines.push(...serializeComponent(comp, "  "));
  }

  lines.push("");
  lines.push("</x-base>");
  lines.push("");
  return lines.join("\n");
}

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const design = params.oem as string;
  const templateName = params.type as string;
  const { isAccount, accountKey, accountData } = useAccount();
  const builderMode = searchParams.get("builder");
  const isHtmlOnlyBuilder = builderMode === "html";

  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewKeyRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
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
  const [selectedComponent, setSelectedComponent] = useState<number | null>(
    null,
  );
  const selectedComponentRef = useRef<number | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
    () => buildPreviewVariableMap(accountData, selectedPreviewContact),
    [accountData, selectedPreviewContact],
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
        });
        const data = await res.json();
        if (data.html) {
          previewKeyRef.current += 1;
          setPreviewHtml(injectLoomiAttributes(data.html));
        } else if (data.error) setPreviewError(data.error);
      } catch (err: any) {
        setPreviewError(err.message || "Preview failed");
      }
      setPreviewLoading(false);
    },
    [previewVariableMap],
  );

  const loadPreviewContacts = useCallback(async () => {
    if (!accountKey) {
      setPreviewContacts([]);
      setPreviewContactsError("");
      setSelectedPreviewContactId("__sample__");
      return;
    }

    setPreviewContactsLoading(true);
    setPreviewContactsError("");
    try {
      const res = await fetch(
        `/api/esp/contacts?accountKey=${encodeURIComponent(accountKey)}&limit=30`,
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
  }, [accountKey]);

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
          // Use marker-injected preview for click-to-select support
          const previewCode = serializeTemplateForPreview(
            parsedData,
            new Set(),
          );
          compilePreview(previewCode);
        } else if (rawData.raw) {
          // Fallback: compile raw if parsing failed
          compilePreview(rawData.raw);
        }
      })
      .catch((err) => console.error("Error loading template:", err));
  }, [design, templateName]);

  useEffect(() => {
    setHasChanges(code !== originalCode);
  }, [code, originalCode]);

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
      200,
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
    if (!parsed) return;
    const newComponents = [...parsed.components];
    newComponents[compIndex] = {
      ...newComponents[compIndex],
      props: { ...newComponents[compIndex].props, [key]: value },
    };
    const newParsed = { ...parsed, components: newComponents };
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

  // Update a prop on ALL cta components at once (global CTA style override)
  const updateCtaComponents = (propKey: string, value: string) => {
    if (!parsed) return;
    const newComponents = parsed.components.map((comp) => {
      if (comp.type !== "cta") return comp;
      const newProps = { ...comp.props };
      if (value) {
        newProps[propKey] = value;
      } else {
        delete newProps[propKey];
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
        300,
      );
    } else {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => compilePreview(prev), 300);
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
        300,
      );
    } else {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => compilePreview(next), 300);
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
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        if (selectedComponent === index) setSelectedComponent(null);
      } else {
        next.add(index);
        setSelectedComponent(index);
      }
      return next;
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
          300,
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
      const res = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design, type: templateName, raw: code }),
      });
      if (res.ok) {
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

  const handleSchedule = async () => {
    if (hasChanges) {
      const saved = await handleSave();
      if (!saved) return;
    }

    const next = new URLSearchParams({
      design,
      type: templateName,
    });
    if (searchParams.get('campaignDraft') === '1') {
      next.set('campaignDraft', '1');
    }
    if (isHtmlOnlyBuilder) next.set("builder", "html");
    router.push(`/campaigns/schedule?${next.toString()}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Save first if there are unsaved changes
      if (hasChanges) {
        await fetch("/api/templates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ design, type: templateName, raw: code }),
        });
        setOriginalCode(code);
      }

      const res = await fetch("/api/templates/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: `${design}/${templateName}`, project: isAccount ? "client" : "core" }),
      });
      const data = await res.json();

      if (!res.ok || !data.files?.length) {
        toast.error(data.error || data.errors?.[0]?.error || "Export failed");
        setExporting(false);
        return;
      }

      // Download the compiled HTML file
      const file = data.files[0];
      const blob = new Blob([file.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Exported successfully!");
    } catch {
      toast.error("Export failed");
    }
    setExporting(false);
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
        200,
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

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;

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
          position: absolute; top: 4px; right: 4px; z-index: 9999;
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

      const showToolbar = (tr: HTMLElement, idx: number) => {
        toolbarIdx = idx;
        tr.style.position = "relative";
        tr.appendChild(toolbar);
        toolbar.style.display = "flex";
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
      };

      // Hover to show toolbar
      doc.addEventListener("mouseover", (e: Event) => {
        const target = e.target as HTMLElement;
        if (toolbar.contains(target)) return;
        const outer = findOuterLoomi(target);
        if (!outer) {
          hideToolbar();
          return;
        }
        const idx = parseInt(outer.getAttribute("data-loomi") || "", 10);
        if (isNaN(idx)) return;
        if (idx !== toolbarIdx) showToolbar(outer, idx);
      });

      doc.addEventListener("mouseleave", () => {
        hideToolbar();
      });

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

  const designLabel = design
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const lineCount = code.split("\n").length;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Top toolbar */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={isAccount ? "/emails" : "/templates"}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div>
            <h2 className="text-lg font-bold capitalize">{designLabel}</h2>
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
          <button
            onClick={handleSchedule}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            title="Open campaign scheduling"
          >
            <PaperAirplaneIcon className="w-3.5 h-3.5" />
            Schedule
          </button>
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
          <button
            onClick={() => compilePreview(code)}
            disabled={previewLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
            title="Refresh preview"
          >
            <ArrowPathIcon
              className={`w-3.5 h-3.5 ${previewLoading ? "animate-spin" : ""}`}
            />
            Preview
          </button>
          <button
            onClick={handleOpenHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
            title="View recent saved versions"
          >
            <ClockIcon className="w-3.5 h-3.5" />
            History
          </button>
          <button
            onClick={() => setShowAiAssistant((prev) => !prev)}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
              showAiAssistant
                ? "text-white border-pink-300/70 ring-1 ring-cyan-300/35 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 shadow-[0_8px_24px_rgba(45,212,191,0.35)]"
                : "text-pink-100 border-pink-400/40 bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 hover:from-orange-500/30 hover:via-pink-500/30 hover:to-purple-500/30 hover:border-pink-300/60 hover:ring-1 hover:ring-cyan-300/25 hover:shadow-[0_6px_18px_rgba(45,212,191,0.22)]"
            }`}
            title="Open AI assistant"
          >
            <SparklesIcon
              className={`w-3.5 h-3.5 transition-transform ${showAiAssistant ? "scale-110" : "group-hover:scale-110 group-hover:rotate-6"}`}
            />
            AI Assist
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40 transition-colors"
            title="Build &amp; export compiled HTML"
          >
            <ArrowDownTrayIcon
              className={`w-3.5 h-3.5 ${exporting ? "animate-bounce" : ""}`}
            />
            {exporting ? "Building..." : "Export"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <DocumentArrowDownIcon className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <QuestionMarkCircleIcon className="w-4 h-4" />
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
                {visualTab === "settings" &&
                  parsed &&
                  SETTINGS_SECTIONS.map((section, sectionIdx) => (
                    <div key={section.key}>
                      <h3
                        className={`text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider ${sectionIdx > 0 ? "mt-4" : ""} mb-2`}
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
                              const firstCta = parsed.components.find(
                                (c) => c.type === "cta",
                              );
                              val = firstCta?.props[fKey] || "";
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
                          let i = 0;
                          while (i < section.fields.length) {
                            const field = section.fields[i];
                            const next = section.fields[i + 1];
                            if (field.half && next?.half) {
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
                        (k) => k !== "rooftop",
                      );
                      const allSchemaProps =
                        schema?.props.filter((p) => p.key !== "rooftop") || [];

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
                          onDragStart={(e) => {
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
                            <div className="group/comp flex items-center hover:bg-[var(--muted)] transition-colors">
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
                                  <DocumentDuplicateIcon className="w-3.5 h-3.5" />
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
                              <div className="px-3 pb-3 border-t border-[var(--border)] pt-3 space-y-3">
                                {schema ? (
                                  <ComponentPropsRenderer
                                    schema={schema}
                                    props={comp.props}
                                    allSchemaProps={allSchemaProps}
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
                    !accountKey || previewContactsLoading
                  }
                  className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-40"
                  title={
                    accountKey
                      ? "Refresh contacts"
                      : "Switch to an ESP-connected account to load contacts"
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
                  className={`p-1.5 rounded-lg transition-colors ${copied ? "text-green-400 bg-green-500/10" : "bg-[var(--muted)] hover:bg-[var(--accent)] disabled:opacity-40"}`}
                  title="Copy HTML"
                >
                  {copied ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <ClipboardDocumentIcon className="w-4 h-4" />
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
                      <DocumentDuplicateIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
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
              <iframe
                ref={iframeRef}
                key={`${previewKeyRef.current}-${previewWidth}`}
                srcDoc={previewHtml}
                className="border-0 block mx-auto"
                style={{
                  width: previewWidth === "mobile" ? "375px" : "100%",
                  minHeight: "100vh",
                }}
                title="Email preview"
                sandbox="allow-same-origin"
                onLoad={handleIframeLoad}
              />
            ) : (
              <div className="p-8 text-center text-zinc-500 text-sm mt-8">
                <ArrowPathIcon className="w-8 h-8 mx-auto mb-3 animate-spin" />
                <p>Loading preview...</p>
              </div>
            )}
          </div>
        </div>

        {showAiAssistant && (
          <div className="relative w-[360px] flex-shrink-0 flex flex-col border border-pink-400/45 rounded-xl overflow-hidden bg-slate-950/80 shadow-[0_0_0_1px_rgba(244,114,182,0.2),0_26px_54px_rgba(45,212,191,0.22)] animate-slide-in-right">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(251,146,60,0.08),transparent_42%),radial-gradient(circle_at_90%_100%,rgba(45,212,191,0.08),transparent_45%)]" />
            <div className="relative z-10 flex h-full flex-col">
              {/* Header */}
              <div className="px-4 py-2.5 border-b border-pink-300/30 bg-[linear-gradient(90deg,rgba(249,115,22,0.12)_0%,rgba(236,72,153,0.08)_42%,rgba(139,92,246,0.1)_76%,rgba(45,212,191,0.08)_100%)] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <SparklesIcon className="w-4 h-4 text-pink-100 drop-shadow-[0_0_12px_rgba(236,72,153,0.75)]" />
                  <p className="text-xs font-semibold text-pink-50">
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
                      className="p-1 rounded-lg text-pink-100/60 hover:text-white hover:bg-white/10 transition-colors"
                      title="Clear conversation"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowAiAssistant(false)}
                    className="p-1 rounded-lg text-pink-100/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="Close AI assistant"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Context bar */}
              <div className="px-3 py-2 border-b border-pink-300/20 bg-white/[0.03] backdrop-blur-[1px] flex items-center gap-2">
                {selectedEditorComponent ? (
                  <p className="text-[10px] text-pink-100/80 truncate">
                    <span className="text-pink-50 font-medium">
                      Section {selectedEditorComponent.index + 1}:
                    </span>{" "}
                    {selectedEditorComponent.label} &middot;{" "}
                    {Object.keys(selectedEditorComponent.props).length} prop
                    {Object.keys(selectedEditorComponent.props).length === 1
                      ? ""
                      : "s"}
                  </p>
                ) : (
                  <p className="text-[10px] text-pink-100/60">
                    Select a section for prop-level suggestions
                  </p>
                )}
              </div>

              {/* Conversation thread */}
              <div
                ref={aiScrollRef}
                className="flex-1 overflow-y-auto p-3 space-y-3 bg-black/20"
              >
                {/* Welcome / empty state */}
                {aiHistory.length === 0 && !aiLoading && (
                  <div className="space-y-3">
                    <div className="border border-dashed border-pink-300/35 rounded-lg p-3 text-center bg-white/[0.03]">
                      <SparklesIcon className="w-5 h-5 mx-auto text-pink-200/60 mb-1.5" />
                      <p className="text-xs text-pink-100/75">
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
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium border border-pink-300/25 text-pink-100/80 bg-white/[0.04] hover:bg-white/[0.1] hover:text-pink-50 transition-colors"
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
                        <div className="max-w-[85%] bg-white/[0.12] border border-pink-300/20 rounded-lg rounded-br-sm px-3 py-2">
                          <p className="text-xs text-pink-50 whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Reply text */}
                        {msg.content && (
                          <div className="border border-pink-300/25 rounded-lg rounded-bl-sm p-2.5 bg-white/[0.05] backdrop-blur-sm">
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-pink-50">
                              {msg.content}
                            </p>
                          </div>
                        )}
                        {/* Suggestions */}
                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="border border-pink-300/25 rounded-lg p-2.5 bg-white/[0.04]">
                            <p className="text-[10px] uppercase tracking-wider text-pink-100/80 mb-2">
                              Suggestions
                            </p>
                            <div className="space-y-1.5">
                              {msg.suggestions.map((suggestion, sIdx) => (
                                <div
                                  key={`${suggestion}-${sIdx}`}
                                  className="flex items-start gap-2 bg-slate-950/35 border border-pink-300/20 rounded-md px-2 py-1.5"
                                >
                                  <p className="text-xs flex-1 text-pink-50">
                                    {suggestion}
                                  </p>
                                  <button
                                    onClick={() =>
                                      handleCopySuggestion(suggestion)
                                    }
                                    className="p-1 rounded text-pink-100/70 hover:text-white hover:bg-cyan-400/20 transition-colors"
                                    title="Copy suggestion"
                                  >
                                    {copiedSuggestion === suggestion ? (
                                      <CheckIcon className="w-3.5 h-3.5 text-green-400" />
                                    ) : (
                                      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
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
                            <div className="border border-pink-300/25 rounded-lg p-2.5 bg-white/[0.04]">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase tracking-wider text-pink-100/80">
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
                                    className="border border-pink-300/20 rounded-md p-2 bg-slate-950/35"
                                  >
                                    <p className="text-[11px] font-medium text-pink-50">
                                      {edit.key}
                                    </p>
                                    <p className="text-xs mt-1 whitespace-pre-wrap text-pink-50">
                                      {edit.value}
                                    </p>
                                    {edit.reason && (
                                      <p className="text-[10px] text-pink-100/70 mt-1">
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
                        className="w-1.5 h-1.5 rounded-full bg-pink-300/60 animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-pink-300/60 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-pink-300/60 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <p className="text-[10px] text-pink-100/60">Thinking...</p>
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="p-3 border-t border-pink-300/20 bg-black/25 space-y-2">
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
                    className="flex-1 bg-slate-950/55 border border-pink-300/35 rounded-lg px-3 py-2 text-xs text-pink-50 placeholder:text-pink-100/45 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300/55"
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
                          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                            {formatBytes(version.size)}
                          </p>
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
    </div>
  );
}
