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

  // --- Zen Focus Mode: highlight current paragraph ---
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
          child.style.opacity = "1";
          child.style.transition = "opacity 0.3s ease";
        } else {
          child.style.opacity = "0.25";
          child.style.transition = "opacity 0.6s ease";
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
          child.style.transition = "opacity 1.5s ease";
        }
      });
    }
  }, [isIdle]);

  // --- Typewriter Scroll: keep cursor at screen center ---
  const typewriterScroll = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.top === 0 && rect.left === 0) return;

    const viewportCenter = window.innerHeight / 2;
    const offset = rect.top - viewportCenter;

    if (Math.abs(offset) > 50) {
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

      // Heading detection: # ## ###
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

      // Skip modifier keys, navigation keys
      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta" ||
        e.key === "Tab" ||
        e.key === "CapsLock" ||
        e.key === "Escape" ||
        e.key.startsWith("Arrow") ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "PageUp" ||
        e.key === "PageDown"
      ) {
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

      // Play keystroke sound with WPM and accent
      engineRef.current.playKeystroke(wpm, accentKey);

      // Update Pulse Indicator
      const stability = calculateRhythmStability();
      setPulseIntensity(stability);

      // Update focus paragraph + typewriter scroll + markdown
      requestAnimationFrame(() => {
        updateFocusParagraph();
        typewriterScroll();
        applyMarkdownFormatting();
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
    ],
  );

  // --- Handle input for auto-save + char count ---
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerText;
    charCountRef.current = content.length;
    setCharCount(content.length);
    debouncedSave(content);
  }, []);

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
        style={
          {
            "--caret-intensity": caretIntensity,
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
