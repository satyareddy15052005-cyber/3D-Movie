import React, { useState } from 'react';
import { Monitor, Trash2, Volume2, X } from 'lucide-react';
import { useCinemaStore } from '../../store/cinemaStore';
import { GraphicsQuality } from '../../types/cinema';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    graphicsQuality,
    setGraphicsQuality,
    audioSettings,
    updateAudioSettings,
    fourDxSettings,
    updateFourDxSettings,
    screenReflectionBrightness,
    setScreenReflectionBrightness,
    clearLocalCache,
    playlist,
  } = useCinemaStore();

  const [cacheClearedMsg, setCacheClearedMsg] = useState(false);

  if (!isSettingsOpen) return null;

  const handleClearCache = async () => {
    await clearLocalCache();
    setCacheClearedMsg(true);
    window.setTimeout(() => setCacheClearedMsg(false), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0E0F13] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <h2 id="settings-modal-title" className="font-display text-2xl text-[#F4F1EA]">
            Auditorium & Playback Settings
          </h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-400 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
          {/* Graphics Quality */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[#F4F1EA]">
              <Monitor className="h-4 w-4 text-[#D4AF37]" />
              <span>Graphics Quality</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setGraphicsQuality(tier)}
                  className={`rounded-lg border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
                    graphicsQuality === tier
                      ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#E5C158]'
                      : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>

            <div className="pt-2 space-y-2">
              <label className="flex items-center justify-between text-xs text-neutral-300">
                <span>Screen Light Reflection Brightness</span>
                <span className="font-mono-tabular text-[#E5C158]">
                  {Math.round(screenReflectionBrightness * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={screenReflectionBrightness}
                onChange={(e) => setScreenReflectionBrightness(parseFloat(e.target.value))}
                className="w-full accent-[#D4AF37]"
              />
            </div>
          </section>

          {/* Audio Defaults */}
          <section className="space-y-4 border-t border-white/[0.08] pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-[#F4F1EA]">
              <Volume2 className="h-4 w-4 text-[#D4AF37]" />
              <span>Audio Mix Preferences</span>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between text-xs text-neutral-300">
                <span>Master Volume</span>
                <span className="font-mono-tabular text-neutral-400">
                  {Math.round(audioSettings.masterVolume * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioSettings.masterVolume}
                onChange={(e) =>
                  updateAudioSettings({ masterVolume: parseFloat(e.target.value) })
                }
                className="w-full accent-[#D4AF37]"
              />

              <label className="flex items-center justify-between pt-1 text-xs text-neutral-300 cursor-pointer">
                <span>3D Spatial Audio</span>
                <input
                  type="checkbox"
                  checked={audioSettings.spatialSimulation}
                  onChange={(e) =>
                    updateAudioSettings({ spatialSimulation: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#D4AF37]"
                />
              </label>
            </div>
          </section>

          {/* 4DX Effects */}
          <section className="space-y-3 border-t border-white/[0.08] pt-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#F4F1EA]">4DX Effects</span>
              <input
                type="checkbox"
                checked={fourDxSettings.enabled}
                onChange={(e) => updateFourDxSettings({ enabled: e.target.checked })}
                className="h-4 w-4 accent-[#D4AF37]"
              />
            </div>
          </section>

          {/* Local Media Cache */}
          <section className="space-y-3 border-t border-white/[0.08] pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#F4F1EA]">Local Cache</p>
                <p className="text-xs text-neutral-400">{playlist.length} queued</p>
              </div>
              <button
                type="button"
                onClick={handleClearCache}
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Cache</span>
              </button>
            </div>
            {cacheClearedMsg && (
              <p className="text-xs text-emerald-400">Cache cleared.</p>
            )}
          </section>
        </div>

        <div className="border-t border-white/[0.08] bg-[#0A0B0E] px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="rounded-md bg-[#D4AF37] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[#070709] hover:bg-[#E5C158] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
