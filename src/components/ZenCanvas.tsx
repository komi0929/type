"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { getSoundEngine, type AccentKey } from "@/lib/sound-engine";
import { DEFAULT_PRESET, type PresetId } from "@/lib/presets";
import { loadDocument, debouncedSave } from "@/lib/storage";

interface ZenCanvasProps {
  onCommandPalette: () => void;
  onTypingStateChange?: (isTyping: boolean) => void;
}

export default function ZenCanvas({
  onCommandPalette,
  onTypingStateChange,
}: ZenCanvasProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(getSoundEngine());
  const [isIdle, setIsIdle] = useState(false);
  const [isDeepIdle, setIsDeepIdle] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<PresetId>(DEFAULT_PRESET);
  const [focusModeEnabled] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keystrokeTimesRef = useRef<number[]>([]);
  const charCountRef = useRef(0);
  const [charCount, setCharCount] = useState(0);
  const [currentWpm, setCurrentWpm] = useState(0);

  // Pulse Indicator: track rhythm stability
  const [pulseIntensity, setPulseIntensity] = useState(0);
  const intervalHistoryRef = useRef<number[]>([]);
  const lastKeystrokeTimeRef = useRef(0);

  // #11 Smooth Caret
  const caretRef = useRef<HTMLDivElement>(null);
  const caretIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // #7 Dynamic Ink — track IME composition state
  const isComposingRef = useRef(false);
  const inkTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // --- Calculate WPM ---
  const calculateWPM = useCallback((): number => {
    const now = Date.now();
    const times = keystrokeTimesRef.current;
    const cutoff = now - 5000;
    keystrokeTimesRef.current = times.filter((t) => t > cutoff);
    const recentCount = keystrokeTimesRef.current.length;
    return (recentCount / 5) * 12;
  }, []);

  // --- Calculate Rhythm Stability (for Pulse Indicator) ---
  const calculateRhythmStability = useCallback((): number => {
    const intervals = intervalHistoryRef.current;
    if (intervals.length < 4) return 0;

    if (intervals.length > 20) {
      intervalHistoryRef.current = intervals.slice(-20);
    }

    const recent = intervalHistoryRef.current.slice(-12);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean === 0) return 0;

    const variance =
      recent.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / recent.length;
    const cv = Math.sqrt(variance) / mean;

    return Math.max(0, Math.min(1, 1 - cv / 0.5));
  }, []);

  // --- Initialize ---
  useEffect(() => {
    const initAudio = async () => {
      const engine = engineRef.current;
      await engine.init();
      engine.setPreset(currentPreset);
    };

    const loadSaved = async () => {
      try {
        const content = await loadDocument();
        if (editorRef.current && content) {
          // Wrap content in divs to ensure consistent DOM structure
          const lines = content.split("\n");
          editorRef.current.innerHTML = lines
            .map((line) => `<div>${line || "<br>"}</div>`)
            .join("");
          charCountRef.current = content.length;
          setCharCount(content.length);
        }
      } catch {
        // First time — no saved content
      }
    };

    initAudio();
    loadSaved();
    setIsInitialized(true);

    setTimeout(() => editorRef.current?.focus(), 100);

    const engine = engineRef.current;
    const currentInkTimers = inkTimersRef.current;
    return () => {
      engine.dispose();
      currentInkTimers.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Update preset ---
  useEffect(() => {
    const engine = engineRef.current;
    engine.setPreset(currentPreset);
  }, [currentPreset]);

  // Expose setPreset for command palette
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__flowtype_setPreset = (
      id: PresetId,
    ) => {
      setCurrentPreset(id);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)
        .__flowtype_setPreset;
    };
  }, []);

  // --- #7 IME Composition handlers ---
  // Store callback refs to avoid 'accessed before declared' issues
  const updateCaretPositionRef = useRef<() => void>(() => {});
  const applyDynamicInkRef = useRef<() => void>(() => {});

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleCompositionStart = () => {
      isComposingRef.current = true;
      editor.classList.add("ime-composing");
      if (caretRef.current) {
        caretRef.current.classList.add("caret-composing");
      }
    };

    const handleCompositionEnd = () => {
      isComposingRef.current = false;
      editor.classList.remove("ime-composing");
      if (caretRef.current) {
        caretRef.current.classList.remove("caret-composing");
      }
      requestAnimationFrame(() => {
        updateCaretPositionRef.current();
        applyDynamicInkRef.current();
      });
    };

    editor.addEventListener("compositionstart", handleCompositionStart);
    editor.addEventListener("compositionend", handleCompositionEnd);

    return () => {
      editor.removeEventListener("compositionstart", handleCompositionStart);
      editor.removeEventListener("compositionend", handleCompositionEnd);
    };
  }, []);

  // --- #11 Smooth Caret: update position ---
  const updateCaretPosition = useCallback(() => {
    if (!caretRef.current || !editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      caretRef.current.style.opacity = "0";
      return;
    }

    const range = selection.getRangeAt(0);

    // Hide custom caret when text is selected (range not collapsed)
    if (!range.collapsed) {
      caretRef.current.style.opacity = "0";
      return;
    }

    // Hide during IME composition
    if (isComposingRef.current) {
      return;
    }

    // Strategy: try to find the cursor's line div and use it as reference
    // This is more reliable than range.getBoundingClientRect() which can
    // return wrong values at line boundaries
    let lineNode: Node | null = range.startContainer;
    if (lineNode.nodeType === Node.TEXT_NODE) {
      lineNode = lineNode.parentNode;
    }
    while (lineNode && lineNode.parentNode !== editorRef.current) {
      lineNode = lineNode.parentNode;
    }

    // Get the range rect (cursor position within the line)
    const rect = range.getBoundingClientRect();

    // Check if rect is valid (non-zero position)
    const rectIsValid = !(
      rect.width === 0 &&
      rect.height === 0 &&
      rect.top === 0 &&
      rect.left === 0
    );

    if (rectIsValid && rect.height > 0) {
      // Valid rect — use its left position
      // For top position, use the LINE NODE's top to avoid cross-line drift
      let top = rect.top;
      let height = rect.height;

      if (lineNode && lineNode instanceof HTMLElement) {
        const lineRect = lineNode.getBoundingClientRect();
        // Use line's top + offset to keep caret within the correct line
        const lineMiddle = lineRect.top + lineRect.height / 2;
        const rectMiddle = rect.top + rect.height / 2;
        // If caret midpoint is more than half a line away from line midpoint,
        // snap to the line position (prevents cross-line drift)
        if (Math.abs(rectMiddle - lineMiddle) > lineRect.height * 0.6) {
          top = lineRect.top;
          height = lineRect.height;
        }
      }

      caretRef.current.style.opacity = "1";
      caretRef.current.style.height = `${height}px`;
      caretRef.current.style.transform = `translate(${rect.left}px, ${top}px)`;
    } else if (
      lineNode &&
      lineNode instanceof HTMLElement &&
      lineNode !== editorRef.current
    ) {
      // Zero rect but we have a line node — use its position (empty line)
      const lineRect = lineNode.getBoundingClientRect();
      if (lineRect.height > 0) {
        caretRef.current.style.opacity = "1";
        caretRef.current.style.height = `${lineRect.height}px`;
        caretRef.current.style.transform = `translate(${lineRect.left}px, ${lineRect.top}px)`;
      } else {
        // Line exists but has no height — use temp measurement
        const tempSpan = document.createTextNode("\u200B");
        range.insertNode(tempSpan);
        const tempRange = document.createRange();
        tempRange.selectNode(tempSpan);
        const tempRect = tempRange.getBoundingClientRect();
        if (tempRect.top !== 0 || tempRect.left !== 0) {
          caretRef.current.style.opacity = "1";
          caretRef.current.style.height = `${tempRect.height || 24}px`;
          caretRef.current.style.transform = `translate(${tempRect.left}px, ${tempRect.top}px)`;
        }
        tempSpan.parentNode?.removeChild(tempSpan);
        editorRef.current.normalize();
      }
    } else {
      // Ultimate fallback: position at editor's content start
      const editorRect = editorRef.current.getBoundingClientRect();
      const cs = getComputedStyle(editorRef.current);
      const pt = parseFloat(cs.paddingTop);
      const pl = parseFloat(cs.paddingLeft);
      caretRef.current.style.opacity = "1";
      caretRef.current.style.height = "24px";
      caretRef.current.style.transform = `translate(${editorRect.left + pl}px, ${editorRect.top + pt - editorRef.current.scrollTop}px)`;
    }

    // Reset caret idle animation
    caretRef.current.classList.remove("caret-idle");
    if (caretIdleTimerRef.current) clearTimeout(caretIdleTimerRef.current);
    caretIdleTimerRef.current = setTimeout(() => {
      if (caretRef.current) {
        caretRef.current.classList.add("caret-idle");
      }
    }, 500);
  }, []);

  // Keep ref in sync for IME composition handlers
  useEffect(() => {
    updateCaretPositionRef.current = updateCaretPosition;
  }, [updateCaretPosition]);

  // --- #8 Zen Focus Mode: Depth of Field ---
  const updateFocusParagraph = useCallback(() => {
    if (!editorRef.current || !focusModeEnabled) return;

    const editor = editorRef.current;
    const children = editor.childNodes;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let currentNode: Node | null = range.startContainer;

    // Walk up to find the direct child of editor
    while (currentNode && currentNode.parentNode !== editor) {
      currentNode = currentNode.parentNode;
    }

    children.forEach((child) => {
      if (child instanceof HTMLElement) {
        if (child === currentNode) {
          child.style.opacity = "1";
          child.style.filter = "blur(0px)";
        } else {
          child.style.opacity = "0.55";
          child.style.filter = "blur(0.5px)";
        }
      }
    });
  }, [focusModeEnabled]);

  // Reset focus mode when idle
  useEffect(() => {
    if (isIdle && editorRef.current) {
      const children = editorRef.current.childNodes;
      children.forEach((child) => {
        if (child instanceof HTMLElement) {
          child.style.opacity = "1";
          child.style.filter = "blur(0px)";
        }
      });
    }
  }, [isIdle]);

  // --- #9 Typewriter Scroll: keep cursor at center of EDITOR ---
  const typewriterScroll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.top === 0 && rect.left === 0) return;

    // Calculate editor's visible center
    const editorRect = editor.getBoundingClientRect();
    const editorVisibleCenter = editorRect.top + editorRect.height / 2;

    // How far is cursor from the editor's visible center?
    const offset = rect.top - editorVisibleCenter;

    if (Math.abs(offset) > 30) {
      // Use instant scroll to prevent async scroll desynchronizing with caret
      editor.scrollBy({ top: offset, behavior: "instant" });
    }
  }, []);

  // --- Markdown Live Preview ---
  const applyMarkdownFormatting = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    // Ensure first child is wrapped in a div (contentEditable quirk)
    if (editor.firstChild && editor.firstChild.nodeType === Node.TEXT_NODE) {
      const div = document.createElement("div");
      div.textContent = editor.firstChild.textContent;
      editor.replaceChild(div, editor.firstChild);
      // Restore cursor to end of the new div
      const sel = window.getSelection();
      if (sel) {
        const newRange = document.createRange();
        newRange.selectNodeContents(div);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }

    const children = Array.from(editor.childNodes);
    children.forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      const text = child.textContent || "";
      // Preserve existing non-markdown classes (like ink-fresh, ink-drying)
      const mdClasses = ["md-h1", "md-h2", "md-h3"];
      mdClasses.forEach((c) => child.classList.remove(c));

      if (text.startsWith("### ")) {
        child.classList.add("md-h3");
      } else if (text.startsWith("## ")) {
        child.classList.add("md-h2");
      } else if (text.startsWith("# ")) {
        child.classList.add("md-h1");
      }
    });
  }, []);

  // --- #7 Dynamic Ink: apply "fresh ink" effect ---
  const applyDynamicInk = useCallback(() => {
    if (!editorRef.current || isComposingRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let node: Node | null = range.startContainer;

    while (node && node.parentNode !== editorRef.current) {
      node = node.parentNode;
    }

    if (node instanceof HTMLElement) {
      node.classList.remove("ink-drying");
      node.classList.add("ink-fresh");

      const timer = setTimeout(() => {
        if (node instanceof HTMLElement) {
          node.classList.remove("ink-fresh");
          node.classList.add("ink-drying");
        }

        const cleanTimer = setTimeout(() => {
          if (node instanceof HTMLElement) {
            node.classList.remove("ink-drying");
          }
        }, 1500);
        inkTimersRef.current.push(cleanTimer);
      }, 2000);
      inkTimersRef.current.push(timer);
    }
  }, []);

  // Keep ref in sync for IME composition handlers
  useEffect(() => {
    applyDynamicInkRef.current = applyDynamicInk;
  }, [applyDynamicInk]);

  // --- #1 Update cursor pan position ---
  const updateCursorPan = useCallback(() => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();

    if (editorRect.width > 0) {
      const ratio = (rect.left - editorRect.left) / editorRect.width;
      engineRef.current.setCursorPan(Math.max(0, Math.min(1, ratio)));
    }
  }, []);

  // --- Detect accent key type ---
  const getAccentKey = useCallback((key: string): AccentKey => {
    if (
      key === "。" ||
      key === "、" ||
      key === "." ||
      key === "," ||
      key === "!" ||
      key === "?" ||
      key === "！" ||
      key === "？" ||
      key === ";" ||
      key === ":"
    ) {
      return "punctuation";
    }
    if (key === "Enter") return "enter";
    if (key === "Backspace" || key === "Delete") return "backspace";
    if (key === " ") return "space";
    return "normal";
  }, []);

  // --- Handle keydown ---
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent<HTMLDivElement>) => {
      // Command palette shortcut
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onCommandPalette();
        return;
      }

      // Skip modifier keys
      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta" ||
        e.key === "Tab" ||
        e.key === "CapsLock" ||
        e.key === "Escape" ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "PageUp" ||
        e.key === "PageDown"
      ) {
        return;
      }

      // Arrow keys: update caret position but don't play sound
      if (e.key.startsWith("Arrow")) {
        requestAnimationFrame(() => {
          updateCaretPosition();
          updateFocusParagraph();
          updateCursorPan();
        });
        return;
      }

      // Resume AudioContext on first interaction
      await engineRef.current.resume();

      // Start ambient on first keystroke
      engineRef.current.startAmbient();

      // Track keystroke timing for rhythm detection
      const now = Date.now();
      if (lastKeystrokeTimeRef.current > 0) {
        const interval = now - lastKeystrokeTimeRef.current;
        if (interval < 2000) {
          intervalHistoryRef.current.push(interval);
        }
      }
      lastKeystrokeTimeRef.current = now;

      // Track keystroke time for WPM
      keystrokeTimesRef.current.push(now);
      const wpm = calculateWPM();
      setCurrentWpm(wpm);

      // Determine accent key type
      const accentKey = getAccentKey(e.key);

      // Play keystroke sound with WPM, accent, and key
      engineRef.current.playKeystroke(wpm, accentKey, e.key);

      // Update Pulse Indicator
      const stability = calculateRhythmStability();
      setPulseIntensity(stability);

      // Update all visual effects after DOM updates
      // For Enter key, use double requestAnimationFrame because contentEditable
      // needs an extra frame to finish creating the new block element
      const isEnterKey = e.key === "Enter";
      const scheduleUpdate = (fn: () => void) => {
        if (isEnterKey) {
          // Use setTimeout for Enter: rAF fires before scroll completes,
          // causing stale coordinates. setTimeout guarantees DOM + scroll settle.
          setTimeout(fn, 50);
        } else {
          requestAnimationFrame(fn);
        }
      };

      scheduleUpdate(() => {
        updateCaretPosition();
        updateFocusParagraph();
        typewriterScroll();
        applyMarkdownFormatting();
        updateCursorPan();
        if (!isComposingRef.current) {
          applyDynamicInk();
        }
      });

      // Reset idle & deep idle states
      setIsIdle(false);
      setIsDeepIdle(false);
      onTypingStateChange?.(true);

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (deepIdleTimerRef.current) clearTimeout(deepIdleTimerRef.current);

      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
        onTypingStateChange?.(false);
        engineRef.current.fadeAmbientToSilence();
        setPulseIntensity(0);
        intervalHistoryRef.current = [];
      }, 3000);

      deepIdleTimerRef.current = setTimeout(() => {
        setIsDeepIdle(true);
      }, 30000);
    },
    [
      onCommandPalette,
      calculateWPM,
      calculateRhythmStability,
      getAccentKey,
      updateFocusParagraph,
      typewriterScroll,
      applyMarkdownFormatting,
      onTypingStateChange,
      updateCaretPosition,
      updateCursorPan,
      applyDynamicInk,
    ],
  );

  // --- Handle input for auto-save + char count ---
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerText;
    charCountRef.current = content.length;
    setCharCount(content.length);
    debouncedSave(content);

    // Update caret after input (covers paste, etc.)
    requestAnimationFrame(() => {
      updateCaretPosition();
    });
  }, [updateCaretPosition]);

  // --- Handle click to update caret position ---
  const handleClick = useCallback(() => {
    requestAnimationFrame(() => {
      updateCaretPosition();
      updateFocusParagraph();
      updateCursorPan();
    });
  }, [updateCaretPosition, updateFocusParagraph, updateCursorPan]);

  // --- Sync caret with browser selection at all times ---
  useEffect(() => {
    const handleSelectionChange = () => {
      // Only update if our editor is the active element
      if (!editorRef.current) return;
      const activeEl = document.activeElement;
      if (
        activeEl !== editorRef.current &&
        !editorRef.current.contains(activeEl)
      )
        return;
      if (isComposingRef.current) return;

      requestAnimationFrame(() => {
        updateCaretPosition();
        updateFocusParagraph();
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [updateCaretPosition, updateFocusParagraph]);

  // --- #6 Kinetic Typography: WPM-based font weight ---
  const dynamicFontWeight = Math.round(
    400 + Math.min(currentWpm / 100, 1) * 200,
  );

  // --- WPM-based caret intensity ---
  const caretIntensity = Math.min(currentWpm / 100, 1);

  return (
    <div
      className={`zen-canvas ${isIdle ? "zen-idle" : "zen-active"} ${isDeepIdle ? "zen-deep-idle" : ""}`}
      onClick={() => editorRef.current?.focus()}
    >
      {/* Pulse Indicator */}
      <div
        className="pulse-indicator"
        style={
          {
            "--pulse-intensity": pulseIntensity,
          } as React.CSSProperties
        }
      />

      {/* #11 Smooth Caret — fixed-position animated cursor */}
      <div ref={caretRef} className="smooth-caret caret-idle" />

      {/* Startup overlay */}
      {!isInitialized && (
        <div className="zen-startup">
          <p className="zen-startup-text">クリックして始める</p>
        </div>
      )}

      <div
        ref={editorRef}
        className="zen-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onClick={handleClick}
        style={
          {
            "--caret-intensity": caretIntensity,
            "--dynamic-font-weight": dynamicFontWeight,
          } as React.CSSProperties
        }
        data-placeholder="ここに書き始める..."
      />

      {/* Character counter */}
      {/* char-counter: visible when idle, hidden during typing (Ghost Mode) */}
      <div className={`char-counter ${!isIdle ? "ghost-hidden" : ""}`}>
        {charCount.toLocaleString()}文字
      </div>
    </div>
  );
}
