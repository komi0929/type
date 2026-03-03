"use client";

import { useState, useCallback, useEffect } from "react";
import ZenCanvas from "@/components/ZenCanvas";
import CommandPalette from "@/components/CommandPalette";
import { DEFAULT_PRESET, type PresetId } from "@/lib/presets";
import {
  type Theme,
  getInitialTheme,
  applyTheme,
  toggleTheme as toggleThemeFn,
} from "@/lib/theme";

export default function Home() {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<PresetId>(DEFAULT_PRESET);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isTyping, setIsTyping] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  // Sync preset state from ZenCanvas's global setter
  useEffect(() => {
    const original = (window as unknown as Record<string, unknown>)
      .__flowtype_setPreset as ((id: PresetId) => void) | undefined;

    (window as unknown as Record<string, unknown>).__flowtype_setPreset = (
      id: PresetId,
    ) => {
      setCurrentPreset(id);
      original?.(id);
    };
  }, []);

  const openPalette = useCallback(() => {
    setIsPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setIsPaletteOpen(false);
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next = toggleThemeFn();
    setTheme(next);
  }, []);

  // Ghost Mode: typing state controls UI visibility
  const handleTypingStateChange = useCallback((typing: boolean) => {
    setIsTyping(typing);
  }, []);

  return (
    <main>
      {/* Theme toggle — Ghost Mode: disappears when typing */}
      <button
        className={`theme-toggle ${isTyping ? "ghost-hidden" : ""}`}
        onClick={handleToggleTheme}
        aria-label={
          theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"
        }
        title={theme === "dark" ? "ライトモード" : "ダークモード"}
      >
        <span className="theme-toggle-icon">
          {theme === "dark" ? "☀" : "☾"}
        </span>
      </button>

      <ZenCanvas
        onCommandPalette={openPalette}
        onTypingStateChange={handleTypingStateChange}
      />
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={closePalette}
        currentPreset={currentPreset}
        currentTheme={theme}
        onToggleTheme={handleToggleTheme}
      />
    </main>
  );
}
