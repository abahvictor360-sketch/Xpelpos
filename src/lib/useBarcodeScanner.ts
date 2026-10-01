"use client";

import { useEffect, useRef } from "react";

/** Keys closer together than this are a scanner, not a person typing. */
const MAX_GAP_MS = 60;
/** Shorter bursts are too easily typed by hand to treat as a scan. */
const MIN_LENGTH = 4;

type Editable = HTMLInputElement | HTMLTextAreaElement;

const isEditable = (target: EventTarget | null): target is Editable =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/** Sets a React-controlled field's value the way typing would, so its state follows. */
function restoreValue(field: Editable, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Listens for a USB / Bluetooth barcode scanner, which types the code as a fast
 * burst of keys ending in Enter. The code reaches `onScan` wherever focus is,
 * and a field the burst was typed into (a quantity box, say) is put back as it was.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastAt = 0;
    let landedIn: { field: Editable; before: string } | null = null;

    const reset = () => {
      buffer = "";
      landedIn = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const now = performance.now();
      const gap = now - lastAt;

      if (event.key === "Enter") {
        if (buffer.length >= MIN_LENGTH && gap <= MAX_GAP_MS) {
          event.preventDefault();
          event.stopPropagation();
          const code = buffer;
          if (landedIn) restoreValue(landedIn.field, landedIn.before);
          reset();
          handler.current(code);
        } else {
          reset();
        }
        return;
      }

      if (event.key.length !== 1) return; // Shift and friends arrive mid-scan; ignore them.

      if (gap > MAX_GAP_MS) {
        // A fresh burst; remember the field it starts in and what it held.
        buffer = event.key;
        landedIn = isEditable(event.target) ? { field: event.target, before: event.target.value } : null;
      } else {
        // Keys still reach the focused field as usual, so a fast typist never
        // loses letters; only a confirmed scan puts the field back.
        buffer += event.key;
      }
      lastAt = now;
    };

    // Capture phase, so a scan is claimed before the focused field's own Enter handling.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
