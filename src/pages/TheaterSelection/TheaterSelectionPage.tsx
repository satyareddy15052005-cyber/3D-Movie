import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  THEATER_CATEGORIES,
  THEATER_LIST,
  getTheatersByCategory,
} from '../../config/theaters/theaterConfigs';
import { TheaterCategoryId } from '../../types/cinema';
import { useCinemaStore } from '../../store/cinemaStore';

export const TheaterSelectionPage: React.FC = () => {
  const { selectTheater } = useCinemaStore();
  const [selectedCategory, setSelectedCategory] = useState<TheaterCategoryId | 'all'>('all');

  const visibleCategories =
    selectedCategory === 'all'
      ? THEATER_CATEGORIES
      : THEATER_CATEGORIES.filter((c) => c.categoryId === selectedCategory);

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#070709] text-[#F4F1EA]">
      <div className="mx-auto max-w-[1440px] px-6 py-12 lg:px-10 lg:py-16">
        <div className="border-b border-white/[0.08] pb-6">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold text-[#F4F1EA]">
            Select Theater
          </h1>
        </div>

        {/* Category Filter Bar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`rounded-md border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
              selectedCategory === 'all'
                ? 'border-[#D4AF37] bg-[#D4AF37] text-[#070709]'
                : 'border-white/15 bg-[#0E0F13] text-neutral-300 hover:border-[#D4AF37]/50 hover:text-white'
            }`}
          >
            All ({THEATER_LIST.length})
          </button>
          {THEATER_CATEGORIES.map((cat) => (
            <button
              key={cat.categoryId}
              type="button"
              onClick={() => setSelectedCategory(cat.categoryId)}
              className={`rounded-md border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
                selectedCategory === cat.categoryId
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#070709]'
                  : 'border-white/15 bg-[#0E0F13] text-neutral-300 hover:border-[#D4AF37]/50 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Categorized Auditorium Sections */}
        <div className="mt-10 space-y-14">
          {visibleCategories.map((cat) => {
            const categoryTheaters = getTheatersByCategory(cat.categoryId);
            return (
              <section key={cat.categoryId} className="space-y-6">
                <div className="border-b border-white/[0.06] pb-3">
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#F4F1EA]">
                    {cat.name}
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {categoryTheaters.map((theater) => {
                    const totalSeats = theater.seatingRows * theater.seatsPerRow;
                    return (
                      <article
                        key={theater.theaterId}
                        className="flex flex-col justify-between overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F13] transition-colors hover:border-[#D4AF37]/50"
                      >
                        <div>
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#14161D]">
                            <img
                              src={theater.previewImage}
                              alt={theater.theaterName}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                            <div
                              className="absolute inset-0 opacity-35 mix-blend-color"
                              style={{
                                background: `linear-gradient(135deg, ${theater.ambienceSwatches[0]}, ${theater.ambienceSwatches[1]})`,
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0E0F13] via-transparent to-black/35" />

                            {/* Ambience Swatch Bar */}
                            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2">
                              <span className="rounded bg-black/75 px-2.5 py-1 text-[11px] font-medium text-[#F4F1EA]">
                                {theater.ambienceName}
                              </span>
                              <div className="flex items-center gap-1.5 rounded bg-black/75 px-2 py-1">
                                {theater.ambienceSwatches.map((hex, idx) => (
                                  <span
                                    key={idx}
                                    className="h-2.5 w-2.5 rounded-sm border border-white/25"
                                    style={{ backgroundColor: hex }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="p-6 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4AF37]">
                              <span className="font-mono-tabular">{totalSeats} Seats</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {theater.screenWidth}m × {theater.screenHeight}m
                                {theater.screenCurvature > 0 ? ' Curved' : ' Flat'}
                              </span>
                            </div>

                            <h3 className="font-display text-2xl font-semibold text-[#F4F1EA]">
                              {theater.theaterName}
                            </h3>
                          </div>
                        </div>

                        <div className="px-6 pb-6 pt-3 border-t border-white/[0.06]">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => selectTheater(theater.theaterId, 'theater_details')}
                              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#F4F1EA] cursor-pointer hover:border-[#D4AF37] hover:text-[#E5C158] transition-colors"
                            >
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => selectTheater(theater.theaterId, 'seat_selection')}
                              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#D4AF37] px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer hover:bg-[#E5C158] transition-colors"
                            >
                              <span>Select Seat</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
