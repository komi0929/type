"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { PRESETS, type PresetId } from "@/lib/presets";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: PresetId;
}

export default function CommandPalette({
  isOpen,
  onClose,
  currentPreset,
}: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when opened
  useEffect(() => {
    if (isOpen) {
      const currentIndex = PRESETS.findIndex((p) => p.id === currentPreset);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentPreset]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % PRESETS.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + PRESETS.length) % PRESETS.length,
          );
          break;
        case "Enter":
          e.preventDefault();
          selectPreset(PRESETS[selectedIndex].id);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [selectedIndex, onClose], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selectPreset = (id: PresetId) => {
    // Call the global setter exposed by ZenCanvas
    const setter = (window as unknown as Record<string, unknown>)
      .__flowtype_setPreset as ((id: PresetId) => void) | undefined;
    setter?.(id);
    onClose();
  };

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll(".palette-item");
      items[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette-container"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        ref={(el) => el?.focus()}
      >
        <div className="palette-header">
          <span className="palette-icon">🎵</span>
          <span className="palette-title">サウンドプリセット</span>
          <kbd className="palette-kbd">ESC</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {PRESETS.map((preset, index) => (
            <div
              key={preset.id}
              className={`palette-item ${
                index === selectedIndex ? "palette-item-selected" : ""
              } ${preset.id === currentPreset ? "palette-item-active" : ""}`}
              onClick={() => selectPreset(preset.id)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="palette-item-emoji">{preset.emoji}</span>
              <div className="palette-item-info">
                <span className="palette-item-name">{preset.name}</span>
                <span className="palette-item-desc">{preset.description}</span>
              </div>
              {preset.id === currentPreset && (
                <span className="palette-item-check">✓</span>
              )}
            </div>
          ))}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑↓</kbd> 移動 <kbd>Enter</kbd> 選択 <kbd>Esc</kbd> 閉じる
          </span>
        </div>
      </div>
    </div>
  );
}
