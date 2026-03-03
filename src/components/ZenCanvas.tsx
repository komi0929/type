"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { getSoundEngine } from "@/lib/sound-engine";
import { DEFAULT_PRESET, type PresetId } from "@/lib/presets";
import { loadDocument, debouncedSave } from "@/lib/storage";

interface ZenCanvasProps {
  onCommandPalette: () => void;
}

export default function ZenCanvas({ onCommandPalette }: ZenCanvasProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(getSoundEngine());
  const [isIdle, setIsIdle] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<PresetId>(DEFAULT_PRESET);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keystrokeTimesRef = useRef<number[]>([]);
  const charCountRef = useRef(0);

  // --- Calculate WPM ---
  const calculateWPM = useCallback((): number => {
    const now = Date.now();
    const times = keystrokeTimesRef.current;
    // Keep only keystrokes from the last 5 seconds
    const cutoff = now - 5000;
    keystrokeTimesRef.current = times.filter((t) => t > cutoff);
    const recentCount = keystrokeTimesRef.current.length;
    // WPM = (chars / 5) / (seconds / 60)
    return (recentCount / 5) * 12;
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
        }
      } catch {
        // First time — no saved content
      }
    };

    initAudio();
    loadSaved();
    setIsInitialized(true);

    // Focus editor
    setTimeout(() => editorRef.current?.focus(), 100);

    return () => {
      engineRef.current.dispose();
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

      // Track keystroke time for WPM
      keystrokeTimesRef.current.push(Date.now());
      const wpm = calculateWPM();

      // Play keystroke sound
      engineRef.current.playKeystroke(wpm);

      // Reset idle state
      setIsIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
        // Fade ambient for Mode C
        engineRef.current.fadeAmbientToSilence();
      }, 3000);
    },
    [onCommandPalette, calculateWPM],
  );

  // --- Handle input for auto-save ---
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerText;
    charCountRef.current = content.length;
    debouncedSave(content);
  }, []);

  // --- WPM-based caret intensity ---
  const wpm = calculateWPM();
  const caretIntensity = Math.min(wpm / 100, 1);

  return (
    <div
      className={`zen-canvas ${isIdle ? "zen-idle" : "zen-active"}`}
      onClick={() => editorRef.current?.focus()}
    >
      {/* Startup overlay — click to begin */}
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
    </div>
  );
}
