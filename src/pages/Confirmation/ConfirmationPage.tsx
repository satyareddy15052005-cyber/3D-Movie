import React from 'react';
import { ArrowLeft, Armchair, CheckCircle2, Film, Play } from 'lucide-react';
import { useCinemaStore } from '../../store/cinemaStore';
import { StepProgressBar } from '../../components/common/StepProgressBar';
import { formatDuration, formatFileSize } from '../../utils/formatters';
import { cinemaAudioEngine } from '../../services/audio/cinemaAudioEngine';

export const ConfirmationPage: React.FC = () => {
  const {
    selectedTheaterConfig,
    selectedSeat,
    videoMode,
    playlist,
    navigate,
    setShowState,
    setCurrentPlaybackIndex,
    setShowCompleted,
    setIsPaused,
  } = useCinemaStore();

  if (!selectedTheaterConfig || !selectedSeat || playlist.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[#070709] p-6 text-center">
        <p className="font-display text-3xl text-[#F4F1EA]">Screening Details Incomplete</p>
        <button
          type="button"
          onClick={() =>
            navigate(
              !selectedTheaterConfig
                ? 'theaters'
                : !selectedSeat
                  ? 'seat_selection'
                  : 'video_upload',
            )
          }
          className="mt-6 rounded-md bg-[#D4AF37] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer"
        >
          Complete Setup
        </button>
      </div>
    );
  }

  const totalDuration = playlist.reduce((sum, item) => sum + item.duration, 0);
  const totalBytes = playlist.reduce((sum, item) => sum + item.fileSize, 0);

  const handleConfirmAndEnter = () => {
    const seatOffsetRatio =
      selectedSeat.worldPosition[0] /
      Math.max(1, selectedTheaterConfig.auditoriumWidth / 2);
    cinemaAudioEngine.unlockFromGesture();
    cinemaAudioEngine
      .initialize(selectedTheaterConfig.audioProfile, seatOffsetRatio, selectedTheaterConfig)
      .catch(() => {});

    setShowState('AUDITORIUM_OPEN');
    setCurrentPlaybackIndex(0);
    setShowCompleted(false);
    setIsPaused(false);
    navigate('virtual_cinema');
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#070709] text-[#F4F1EA]">
      <StepProgressBar />

      <div className="mx-auto max-w-[1200px] px-6 py-10 lg:px-10 lg:py-16">
        <div className="border-b border-white/[0.08] pb-6">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold text-[#F4F1EA]">
            Confirm Screening
          </h1>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Theater & Seat Summary */}
          <div className="lg:col-span-5 space-y-6">
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F13]">
              <div className="aspect-[16/10] w-full bg-[#14161D]">
                <img
                  src={selectedTheaterConfig.previewImage}
                  alt={selectedTheaterConfig.theaterName}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-[#D4AF37]">{selectedTheaterConfig.category}</p>
                  <h2 className="font-display text-2xl font-semibold text-[#F4F1EA]">
                    {selectedTheaterConfig.theaterName}
                  </h2>
                </div>

                <div className="border-t border-white/[0.06] pt-4 space-y-2.5 text-xs sm:text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 shrink-0">Seat</span>
                    <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold text-[#E5C158] text-right">
                      <Armchair className="h-4 w-4 shrink-0" />
                      <span>
                        {selectedSeat.id} (Row {selectedSeat.rowLabel} · Seat{' '}
                        {selectedSeat.seatNumber})
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 shrink-0">Mode</span>
                    <span className="text-[#F4F1EA] font-medium text-right">
                      {videoMode === 'without_ads' ? 'Without Ads' : 'With Ads'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 shrink-0">Screen</span>
                    <span className="font-mono-tabular text-neutral-200 text-right">
                      {selectedTheaterConfig.screenWidth}m × {selectedTheaterConfig.screenHeight}m
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => navigate('seat_selection')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-200 hover:border-[#D4AF37] cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Change Seat</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('video_upload')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-200 hover:border-[#D4AF37] cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Upload</span>
              </button>
            </div>
          </div>

          {/* Right: Playlist Sequence & Confirm CTA */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0E0F13] p-6 sm:p-8 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#F4F1EA]">
                    Playlist
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {playlist.length} {playlist.length === 1 ? 'video' : 'videos'} ·{' '}
                    {formatDuration(totalDuration)} · {formatFileSize(totalBytes)}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              </div>

              <ul className="divide-y divide-white/[0.06] max-h-[360px] overflow-y-auto pr-1">
                {playlist.map((item, idx) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono-tabular text-xs font-semibold text-[#D4AF37] w-6 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="h-10 w-16 shrink-0 overflow-hidden rounded border border-white/10 bg-black">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.fileName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-neutral-600">
                            <Film className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#F4F1EA]">
                          {item.fileName}
                        </p>
                        <p className="text-xs font-mono-tabular text-neutral-400">
                          {item.width}×{item.height} · {formatFileSize(item.fileSize)}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono-tabular text-xs text-neutral-300 shrink-0">
                      {formatDuration(item.duration)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-white/[0.08] pt-6">
              <button
                type="button"
                onClick={handleConfirmAndEnter}
                className="inline-flex w-full items-center justify-center gap-3 rounded-md bg-[#D4AF37] px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer transition-colors hover:bg-[#E5C158] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Enter Theater</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
