import React, { useRef, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import {
  HERO_CINEMA_IMAGE,
  THEATER_CATEGORIES,
  getTheatersByCategory,
} from '../../config/theaters/theaterConfigs';
import { TheaterCategoryId, TheaterId } from '../../types/cinema';
import { useCinemaStore } from '../../store/cinemaStore';

interface HomePageProps {
  aboutSectionRef: React.RefObject<HTMLElement | null>;
}

const HOW_IT_WORKS_STEPS = [
  { number: '01', title: 'Choose Theater' },
  { number: '02', title: 'Select Seat' },
  { number: '03', title: 'Upload Video' },
  { number: '04', title: 'Watch in 3D' },
];

export const HomePage: React.FC<HomePageProps> = ({ aboutSectionRef }) => {
  const { selectTheater, navigate } = useCinemaStore();
  const theatersSectionRef = useRef<HTMLElement>(null);
  const [activeAmbienceByCat, setActiveAmbienceByCat] = useState<
    Record<TheaterCategoryId, TheaterId>
  >({
    standard_2d: 'standard_2d',
    imax: 'imax',
    '4dx': '4dx',
    dolby: 'dolby',
    screenx: 'screenx',
    private_luxury: 'private_luxury',
  });

  const scrollToTheaters = () => {
    theatersSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-[#070709] text-[#F4F1EA]">
      {/* Full-Width Immersive Hero Section */}
      <section className="relative min-h-[84vh] w-full overflow-hidden flex items-end">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={HERO_CINEMA_IMAGE}
            alt="Luxury virtual cinema auditorium interior"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover hero-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-[#070709]/65 to-[#070709]/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070709]/90 via-[#070709]/45 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 pb-16 pt-28 lg:px-10 lg:pb-24">
          <div className="max-w-3xl space-y-6">
            <h1
              className="font-display font-semibold tracking-tight text-[#F4F1EA] leading-[1.03]"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', textWrap: 'balance' }}
            >
              YOUR CINEMA. YOUR SEAT. YOUR EXPERIENCE.
            </h1>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => navigate('theaters')}
                className="inline-flex items-center gap-2.5 rounded-md bg-[#D4AF37] px-7 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer transition-colors hover:bg-[#E5C158] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                <span>Enter Cinema</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={scrollToTheaters}
                className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-black/40 px-7 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#F4F1EA] cursor-pointer transition-colors hover:border-[#D4AF37]/60 hover:bg-white/5"
              >
                <span>Explore Theaters</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Six Theater Categories × Three Ambiences Exploration Section */}
      <section
        ref={theatersSectionRef}
        id="explore-theaters"
        className="mx-auto max-w-[1440px] px-6 py-20 lg:px-10 lg:py-24"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-white/[0.08] pb-6">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#F4F1EA]">
            Theaters
          </h2>
          <button
            type="button"
            onClick={() => navigate('theaters')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#D4AF37] hover:text-[#E5C158] cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {THEATER_CATEGORIES.map((category) => {
            const variants = getTheatersByCategory(category.categoryId);
            const activeId = activeAmbienceByCat[category.categoryId];
            const theater =
              variants.find((v) => v.theaterId === activeId) || variants[0];
            const totalSeats = theater.seatingRows * theater.seatsPerRow;

            return (
              <article
                key={category.categoryId}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F13] transition-colors hover:border-[#D4AF37]/45"
              >
                <div>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#14161D]">
                    <img
                      src={theater.previewImage}
                      alt={theater.theaterName}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div
                      className="pointer-events-none absolute inset-0 opacity-35 mix-blend-color"
                      style={{
                        background: `linear-gradient(135deg, ${theater.ambienceSwatches[0]}, ${theater.ambienceSwatches[1]})`,
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0E0F13] via-transparent to-black/30 opacity-90" />
                    <div className="absolute top-3 left-3 rounded bg-black/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#D4AF37]">
                      {category.name}
                    </div>
                  </div>

                  <div className="p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-[#D4AF37]">
                      <span>{theater.ambienceName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{totalSeats} Seats</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{theater.screenWidth}m Screen</span>
                    </div>

                    <h3 className="font-display text-2xl font-semibold text-[#F4F1EA]">
                      {theater.theaterName}
                    </h3>

                    {/* 3 Ambience Switcher */}
                    <div className="pt-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        {variants.map((v) => {
                          const selected = v.theaterId === theater.theaterId;
                          return (
                            <button
                              key={v.theaterId}
                              type="button"
                              onClick={() =>
                                setActiveAmbienceByCat((prev) => ({
                                  ...prev,
                                  [category.categoryId]: v.theaterId,
                                }))
                              }
                              className={`flex flex-col items-start gap-1 rounded border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                                selected
                                  ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F4F1EA]'
                                  : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/25 hover:text-neutral-200'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                {v.ambienceSwatches.map((hex, idx) => (
                                  <span
                                    key={idx}
                                    className="h-2 w-2 rounded-xs border border-white/25"
                                    style={{ backgroundColor: hex }}
                                  />
                                ))}
                              </div>
                              <span className="w-full truncate text-[10px] font-medium">
                                {v.shortName}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-2">
                  <button
                    type="button"
                    onClick={() => selectTheater(theater.theaterId, 'theater_details')}
                    className="inline-flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#F4F1EA] cursor-pointer transition-colors group-hover:border-[#D4AF37]/60 group-hover:bg-[#D4AF37] group-hover:text-[#070709]"
                  >
                    <span>Explore {theater.shortName}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Quick Steps Strip */}
      <section className="border-t border-white/[0.08] bg-[#0B0C10]">
        <div className="mx-auto max-w-[1440px] px-6 py-12 lg:px-10">
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div key={step.number} className="border-t border-white/[0.1] pt-4 space-y-1.5">
                <span className="font-mono-tabular text-xs font-medium text-[#D4AF37]">
                  {step.number}
                </span>
                <h3 className="text-sm sm:text-base font-semibold text-[#F4F1EA]">{step.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Local Privacy Strip */}
      <section
        ref={aboutSectionRef}
        id="about-experience"
        className="border-t border-white/[0.08] bg-[#070709]"
      >
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-6 py-10 lg:px-10">
          <ShieldCheck className="h-5 w-5 text-[#D4AF37] shrink-0" />
          <p className="text-sm text-neutral-300">
            Private local playback — your videos stay on your device.
          </p>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-white/[0.08] bg-[#050507]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <p className="font-display text-lg font-semibold text-[#F4F1EA]">Aurelia Cinema</p>

          <div className="flex flex-wrap items-center gap-6 text-xs text-neutral-400">
            <button
              type="button"
              onClick={() => navigate('home')}
              className="hover:text-[#F4F1EA] cursor-pointer"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate('theaters')}
              className="hover:text-[#F4F1EA] cursor-pointer"
            >
              Theaters
            </button>
            <button
              type="button"
              onClick={() => aboutSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-[#F4F1EA] cursor-pointer"
            >
              Privacy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
