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
          editorRef.current.innerText = content;
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
    return () => {
      engine.dispose();
      // Clean up ink timers
      inkTimersRef.current.forEach(clearTimeout);
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
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleCompositionStart = () => {
      isComposingRef.current = true;
      // Show native caret during composition
      editor.classList.add("ime-composing");
      // Hide custom caret
      if (caretRef.current) {
        caretRef.current.classList.add("caret-composing");
      }
    };

    const handleCompositionEnd = () => {
      isComposingRef.current = false;
      // Hide native caret again
      editor.classList.remove("ime-composing");
      // Show custom caret
      if (caretRef.current) {
        caretRef.current.classList.remove("caret-composing");
      }
      // Update caret position after composition
      requestAnimationFrame(() => {
        updateCaretPosition();
        applyDynamicInk();
      });
    };

    editor.addEventListener("compositionstart", handleCompositionStart);
    editor.addEventListener("compositionend", handleCompositionEnd);

    return () => {
      editor.removeEventListener("compositionstart", handleCompositionStart);
      editor.removeEventListener("compositionend", handleCompositionEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- #11 Smooth Caret: update position ---
  const updateCaretPosition = useCallback(() => {
    if (!caretRef.current || !editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range.collapsed) {
      // Text is selected, hide custom caret
      caretRef.current.style.opacity = "0";
      return;
    }

    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();

    // If rect is zero (e.g., empty editor), use editor position
    if (rect.top === 0 && rect.left === 0 && rect.width === 0) {
      const computedStyle = getComputedStyle(editorRef.current);
      const paddingTop = parseFloat(computedStyle.paddingTop);
      caretRef.current.style.opacity = "1";
      caretRef.current.style.transform = `translate(${editorRect.left}px, ${editorRect.top + paddingTop}px)`;
      return;
    }

    caretRef.current.style.opacity = "1";
    caretRef.current.style.transform = `translate(${rect.left}px, ${rect.top}px)`;

    // Reset caret idle animation
    caretRef.current.classList.remove("caret-idle");
    if (caretIdleTimerRef.current) clearTimeout(caretIdleTimerRef.current);
    caretIdleTimerRef.current = setTimeout(() => {
      if (caretRef.current) {
        caretRef.current.classList.add("caret-idle");
      }
    }, 500);
  }, []);

  // --- #8 Zen Focus Mode: highlight current paragraph + Depth of Field ---
  const updateFocusParagraph = useCallback(() => {
    if (!editorRef.current || !focusModeEnabled) return;

    const editor = editorRef.current;
    const children = editor.childNodes;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let currentNode: Node | null = range.startContainer;

    while (currentNode && currentNode.parentNode !== editor) {
      currentNode = currentNode.parentNode;
    }

    children.forEach((child) => {
      if (child instanceof HTMLElement) {
        if (child === currentNode) {
          // Current line: sharp, near, full opacity
          child.style.opacity = "1";
          child.style.filter = "blur(0px)";
          child.style.transform = "scale(1) translateZ(0)";
        } else {
          // Other lines: faded, slightly blurred, scaled down (depth)
          child.style.opacity = "0.35";
          child.style.filter = "blur(0.6px)";
          child.style.transform = "scale(0.995) translateZ(0)";
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
          child.style.transform = "scale(1) translateZ(0)";
        }
      });
    }
  }, [isIdle]);

  // --- #9 Typewriter Scroll: keep cursor at screen center ---
  const typewriterScroll = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.top === 0 && rect.left === 0) return;

    const viewportCenter = window.innerHeight / 2;
    const offset = rect.top - viewportCenter;

    // Lower threshold for more responsive centering
    if (Math.abs(offset) > 20) {
      window.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, []);

  // --- Markdown Live Preview ---
  const applyMarkdownFormatting = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const children = Array.from(editor.childNodes);

    children.forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      const text = child.textContent || "";

      if (text.startsWith("### ")) {
        child.className = "md-h3";
      } else if (text.startsWith("## ")) {
        child.className = "md-h2";
      } else if (text.startsWith("# ")) {
        child.className = "md-h1";
      } else {
        child.className = "";
      }
    });
  }, []);

  // --- #7 Dynamic Ink: apply "fresh ink" effect ---
  const applyDynamicInk = useCallback(() => {
    if (!editorRef.current || isComposingRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let node = range.startContainer;

    // Walk up to find the block-level parent in the editor
    while (node && node.parentNode !== editorRef.current) {
      node = node.parentNode!;
    }

    if (node instanceof HTMLElement) {
      // Apply ink-fresh class to the current paragraph
      node.classList.remove("ink-drying");
      node.classList.add("ink-fresh");

      // Schedule transition to dry
      const timer = setTimeout(() => {
        node.classList.remove("ink-fresh");
        node.classList.add("ink-drying");

        // Remove drying class after transition completes
        const cleanTimer = setTimeout(() => {
          node.classList.remove("ink-drying");
        }, 1500);
        inkTimersRef.current.push(cleanTimer);
      }, 2000);
      inkTimersRef.current.push(timer);
    }
  }, []);

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

      // Skip modifier keys, navigation keys (but allow arrows for caret update)
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

      // #1 Play keystroke sound with WPM, accent, and key for spatial panning
      engineRef.current.playKeystroke(wpm, accentKey, e.key);

      // Update Pulse Indicator
      const stability = calculateRhythmStability();
      setPulseIntensity(stability);

      // Update focus paragraph + typewriter scroll + markdown + caret + ink
      requestAnimationFrame(() => {
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

      // Deep idle: 30s → text fades (Transient Hypofrontality support)
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
      {/* Pulse Indicator — screen edge glow based on typing rhythm */}
      <div
        className="pulse-indicator"
        style={
          {
            "--pulse-intensity": pulseIntensity,
          } as React.CSSProperties
        }
      />

      {/* #11 Smooth Caret — custom animated cursor */}
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

      {/* Character counter — minimal, Ghost Mode compatible */}
      <div className={`char-counter ${isIdle ? "" : "ghost-hidden"}`}>
        {charCount.toLocaleString()}文字
      </div>
    </div>
  );
}
