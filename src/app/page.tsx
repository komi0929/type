"use client";

import { useState, useCallback, useEffect } from "react";
import ZenCanvas from "@/components/ZenCanvas";
import CommandPalette from "@/components/CommandPalette";
import { DEFAULT_PRESET, type PresetId } from "@/lib/presets";

export default function Home() {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<PresetId>(DEFAULT_PRESET);

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

  return (
    <main>
      <ZenCanvas onCommandPalette={openPalette} />
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={closePalette}
        currentPreset={currentPreset}
      />
    </main>
  );
}
