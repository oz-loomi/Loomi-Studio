"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  TEMPLATE_ICON_CATEGORY_LABELS,
  TEMPLATE_ICON_LIBRARY,
  type TemplateIconCategory,
} from "@/lib/template-icon-library";

export interface TemplateIconSelection {
  id: string;
  label: string;
  svgMarkup: string;
}

interface TemplateIconPickerModalProps {
  onClose: () => void;
  onSelect: (selection: TemplateIconSelection) => Promise<void> | void;
}

type FilterCategory = "all" | TemplateIconCategory;

function serializeIconSvg(svgNode: SVGSVGElement) {
  const svg = svgNode.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "64");
  svg.setAttribute("height", "64");
  svg.removeAttribute("class");
  svg.removeAttribute("aria-hidden");
  svg.removeAttribute("data-slot");

  const allNodes = [svg, ...Array.from(svg.querySelectorAll("*"))];
  for (const node of allNodes) {
    node.removeAttribute("class");
    node.removeAttribute("data-slot");
    if (node.getAttribute("stroke") === "currentColor") {
      node.setAttribute("stroke", "#111111");
    }
    if (node.getAttribute("fill") === "currentColor") {
      node.setAttribute("fill", "#111111");
    }
  }

  if (svg.getAttribute("stroke") === "currentColor") {
    svg.setAttribute("stroke", "#111111");
  }
  if (svg.getAttribute("fill") === "currentColor") {
    svg.setAttribute("fill", "#111111");
  }

  return new XMLSerializer().serializeToString(svg);
}

export function TemplateIconPickerModal({
  onClose,
  onSelect,
}: TemplateIconPickerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FilterCategory>("all");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submittingId]);

  const categories = useMemo<FilterCategory[]>(
    () => ["all", ...Object.keys(TEMPLATE_ICON_CATEGORY_LABELS) as TemplateIconCategory[]],
    [],
  );

  const filteredIcons = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TEMPLATE_ICON_LIBRARY.filter((icon) => {
      if (category !== "all" && icon.category !== category) return false;
      if (!query) return true;
      return (
        icon.label.toLowerCase().includes(query) ||
        icon.id.includes(query) ||
        icon.keywords.some((keyword) => keyword.toLowerCase().includes(query))
      );
    });
  }, [category, search]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={() => {
        if (!submittingId) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/35 bg-white/88 shadow-2xl backdrop-blur-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Choose Icon
            </h3>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Search the library or drag your own SVG onto the icon field to upload it directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(submittingId)}
            className="rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Close icon picker"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search icons"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--input)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
              autoFocus
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((entry) => {
              const isActive = entry === category;
              const label =
                entry === "all" ? "All" : TEMPLATE_ICON_CATEGORY_LABELS[entry];
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setCategory(entry)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--input)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {filteredIcons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
              <p className="text-sm font-medium text-[var(--foreground)]">
                No icons matched that search.
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Try a different keyword or switch categories.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {filteredIcons.map((icon) => {
                const Icon = icon.component;
                const isSubmitting = submittingId === icon.id;
                return (
                  <button
                    key={icon.id}
                    type="button"
                    disabled={Boolean(submittingId)}
                    aria-label={icon.label}
                    title={icon.label}
                    onClick={async (event) => {
                      const svg = event.currentTarget.querySelector("svg");
                      if (!svg) {
                        toast.error("Could not prepare that icon");
                        return;
                      }
                      setSubmittingId(icon.id);
                      try {
                        await onSelect({
                          id: icon.id,
                          label: icon.label,
                          svgMarkup: serializeIconSvg(svg as SVGSVGElement),
                        });
                        onClose();
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to select icon",
                        );
                      } finally {
                        setSubmittingId(null);
                      }
                    }}
                    className="group aspect-square rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/60 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <div className="flex h-full items-center justify-center">
                      {isSubmitting ? (
                        <ArrowPathIcon className="h-7 w-7 animate-spin" />
                      ) : (
                        <Icon className="h-8 w-8" />
                      )}
                    </div>
                    <span className="sr-only">{icon.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
