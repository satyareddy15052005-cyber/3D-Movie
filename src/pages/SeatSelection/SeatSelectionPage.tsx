import React, { useMemo, useState } from 'react';
import { Accessibility, ArrowLeft, ArrowRight, Check, Lock, Sparkles } from 'lucide-react';
import { useCinemaStore } from '../../store/cinemaStore';
import { StepProgressBar } from '../../components/common/StepProgressBar';
import { SeatData } from '../../types/cinema';

export const SeatSelectionPage: React.FC = () => {
  const {
    selectedTheaterConfig,
    theaterSeats,
    selectedSeatId,
    selectedSeat,
    selectSeat,
    navigate,
  } = useCinemaStore();

  const [hoveredSeat, setHoveredSeat] = useState<SeatData | null>(null);

  const rowsGrouped = useMemo(() => {
    const map = new Map<number, { rowLabel: string; seats: SeatData[] }>();
    theaterSeats.forEach((seat) => {
      if (!map.has(seat.rowIndex)) {
        map.set(seat.rowIndex, { rowLabel: seat.rowLabel, seats: [] });
      }
      map.get(seat.rowIndex)!.seats.push(seat);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [theaterSeats]);

  if (!selectedTheaterConfig) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[#070709] p-6 text-center">
        <p className="font-display text-3xl text-[#F4F1EA]">Select a Theater First</p>
        <p className="mt-2 text-sm text-neutral-400">
          Each auditorium has a unique seating layout. Choose a theater to view its map.
        </p>
        <button
          type="button"
          onClick={() => navigate('theaters')}
          className="mt-6 rounded-md bg-[#D4AF37] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer"
        >
          Browse Theaters
        </button>
      </div>
    );
  }

  const config = selectedTheaterConfig;

  const handleSeatClick = (seat: SeatData) => {
    if (seat.status === 'unavailable') return;
    if (selectedSeatId === seat.id) {
      selectSeat(null);
    } else {
      selectSeat(seat.id);
    }
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#070709] text-[#F4F1EA]">
      <StepProgressBar />

      <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-white/[0.08] pb-6">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate('theater_details')}
              className="inline-flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-[#F4F1EA] cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to {config.theaterName}</span>
            </button>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#F4F1EA]">
              Select Your Seat — {config.theaterName}
            </h1>
            <p className="text-sm text-neutral-400">
              {config.seatingArrangementText}. Your 3D auditorium camera will walk directly to
              this exact seat.
            </p>
          </div>

          {/* Seat Legend (Color + Explicit Text & Icon for accessibility) */}
          <div className="flex flex-wrap items-center gap-5 text-xs text-neutral-300">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-600/80 border border-emerald-400" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#D4AF37]/85 border border-[#F3D578]">
                <Sparkles className="h-2.5 w-2.5 text-[#070709]" />
              </span>
              <span>Premium</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-red-600 border border-red-300">
                <Check className="h-2.5 w-2.5 text-white" />
              </span>
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-neutral-700 border border-neutral-600">
                <Lock className="h-2.5 w-2.5 text-neutral-400" />
              </span>
              <span>Unavailable</span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* Interactive 2D Seating Map */}
          <div className="lg:col-span-8 rounded-xl border border-white/[0.08] bg-[#0B0C10] p-5 sm:p-8 overflow-x-auto">
            {/* Screen Direction Graphic */}
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <div
                className={`mx-auto h-3 w-full rounded-t-full border-t-4 border-[#D4AF37]/80 bg-gradient-to-b from-[#D4AF37]/25 to-transparent ${
                  config.screenCurvature > 0.15 ? 'scale-y-125' : ''
                }`}
              />
              <p className="mt-2 text-xs font-medium tracking-[0.2em] sm:tracking-[0.25em] text-neutral-400 uppercase">
                Screen · {config.screenWidth}m × {config.screenHeight}m
                {config.screenCurvature > 0 ? ' Curved Projection' : ' Flat Projection'}
              </p>
              <p className="mt-1.5 text-[11px] text-neutral-500 sm:hidden">
                Swipe left or right to view all seats in the row
              </p>
            </div>

            {/* Seat Grid Rows */}
            <div className="min-w-max mx-auto flex flex-col items-center gap-2.5">
              {rowsGrouped.map(([rowIdx, group]) => {
                const isPremiumRow = config.premiumRows.includes(rowIdx);
                const staggerClass =
                  config.seatPattern === 'staggered'
                    ? rowIdx % 2 === 1
                      ? 'translate-x-2.5'
                      : '-translate-x-1.5'
                    : '';
                const compactSeat = config.seatsPerRow >= 20;
                return (
                  <div key={group.rowLabel} className={`flex items-center gap-3 ${staggerClass}`}>
                    {/* Left Row Label */}
                    <span className="font-mono-tabular w-6 text-right text-xs font-medium text-neutral-500">
                      {group.rowLabel}
                    </span>

                    <div className="flex items-center gap-1">
                      {group.seats.map((seat) => {
                        const isSelected = selectedSeatId === seat.id;
                        const isUnavailable = seat.status === 'unavailable';
                        const isAccessible = seat.status === 'accessible';
                        const isPremium = seat.status === 'premium';
                        const hasAisleAfter = config.aisleAfterSeats.includes(seat.seatNumber);
                        const hasPodGapAfter =
                          !hasAisleAfter &&
                          config.seatPattern === 'twin_pods' &&
                          seat.seatNumber % 2 === 0 &&
                          seat.seatNumber < config.seatsPerRow;

                        let seatClasses =
                          'bg-emerald-600/80 border-emerald-400/70 text-white hover:bg-emerald-500';
                        if (isUnavailable) {
                          seatClasses =
                            'bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed opacity-60';
                        } else if (isSelected) {
                          seatClasses =
                            'bg-red-600 border-red-300 text-white ring-2 ring-red-400/70 scale-105';
                        } else if (isPremium) {
                          seatClasses =
                            'bg-[#D4AF37]/85 border-[#F5D97E] text-[#070709] hover:bg-[#E5C158]';
                        } else if (isAccessible) {
                          seatClasses =
                            'bg-emerald-700/85 border-emerald-300 text-white hover:bg-emerald-500';
                        }

                        return (
                          <React.Fragment key={seat.id}>
                            <button
                              type="button"
                              disabled={isUnavailable}
                              onClick={() => handleSeatClick(seat)}
                              onMouseEnter={() => setHoveredSeat(seat)}
                              onMouseLeave={() => setHoveredSeat(null)}
                              aria-label={`Row ${seat.rowLabel} Seat ${seat.seatNumber} (${
                                isSelected ? 'Selected' : seat.status
                              })`}
                              className={`relative flex ${
                                compactSeat ? 'h-6 w-6 sm:h-7 sm:w-7' : 'h-7 w-7 sm:h-8 sm:w-8'
                              } items-center justify-center rounded-t-md rounded-b-sm border text-[10px] font-mono-tabular font-semibold transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${seatClasses}`}
                            >
                              {isAccessible ? (
                                <Accessibility className="h-3.5 w-3.5" />
                              ) : isUnavailable ? (
                                '×'
                              ) : (
                                seat.seatNumber
                              )}
                            </button>

                            {hasPodGapAfter && <div className="w-2.5 sm:w-3.5" aria-hidden="true" />}

                            {hasAisleAfter && (
                              <div
                                className="w-4 sm:w-6 flex items-center justify-center text-[10px] text-neutral-700 select-none"
                                aria-hidden="true"
                              >
                                ·
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Right Row Label */}
                    <span className="font-mono-tabular w-6 text-left text-xs font-medium text-neutral-500">
                      {group.rowLabel}
                    </span>

                    {isPremiumRow && (
                      <span className="hidden xl:inline-block w-16 text-[10px] text-[#D4AF37]/80">
                        Premium
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hover Preview Bar */}
            <div className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-neutral-400">
              <span>
                {hoveredSeat
                  ? `Hovering: Row ${hoveredSeat.rowLabel}, Seat ${hoveredSeat.seatNumber} (${hoveredSeat.id}) · ${hoveredSeat.status}`
                  : 'Hover or tap any seat to inspect row and seat number'}
              </span>
              <span className="font-mono-tabular hidden sm:inline">
                Tier Rise: {config.rowElevationStep}m / row
              </span>
            </div>
          </div>

          {/* Selected Seat Details & Continue Panel */}
          <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#0E0F13] p-6 space-y-6">
            <div className="space-y-1 border-b border-white/[0.08] pb-4">
              <p className="text-xs font-medium tracking-[0.18em] text-[#D4AF37] uppercase">
                Seat Reservation
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#F4F1EA]">
                {selectedSeat ? `Seat ${selectedSeat.id}` : 'No Seat Selected'}
              </h2>
            </div>

            {selectedSeat ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Auditorium</span>
                  <span className="text-[#F4F1EA] font-medium">{config.shortName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Row & Number</span>
                  <span className="font-mono-tabular text-[#F4F1EA] font-medium">
                    Row {selectedSeat.rowLabel} · Seat {selectedSeat.seatNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Tier Category</span>
                  <span className="capitalize text-[#E5C158] font-medium">
                    {selectedSeat.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">3D Eye Coordinates</span>
                  <span className="font-mono-tabular text-xs text-neutral-300">
                    ({selectedSeat.eyePosition[0]}m, {selectedSeat.eyePosition[1]}m,{' '}
                    {selectedSeat.eyePosition[2]}m)
                  </span>
                </div>
                <p className="pt-2 text-xs text-neutral-400 leading-relaxed">
                  Click the highlighted red seat again to deselect, or choose any other green or
                  gold seat.
                </p>
              </div>
            ) : (
              <p className="text-sm text-neutral-400 leading-relaxed">
                Select one available (green) or premium (gold) seat on the map to synchronize your
                3D auditorium viewpoint before uploading videos.
              </p>
            )}

            <button
              type="button"
              disabled={!selectedSeat}
              onClick={() => navigate('video_upload')}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-4 text-xs font-semibold uppercase tracking-wider transition-colors ${
                selectedSeat
                  ? 'bg-[#D4AF37] text-[#070709] hover:bg-[#E5C158] cursor-pointer'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
              }`}
            >
              <span>Continue to Video Upload</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
