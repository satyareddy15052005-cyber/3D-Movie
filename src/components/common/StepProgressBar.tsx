import React from 'react';
import { AppRoute } from '../../types/cinema';
import { useCinemaStore } from '../../store/cinemaStore';

interface StepItem {
  route: AppRoute;
  number: string;
  label: string;
  reachable: boolean;
}

export const StepProgressBar: React.FC = () => {
  const {
    route,
    navigate,
    selectedTheaterId,
    selectedSeatId,
    playlist,
  } = useCinemaStore();

  const steps: StepItem[] = [
    {
      route: 'theater_details',
      number: '01',
      label: 'Theater',
      reachable: Boolean(selectedTheaterId),
    },
    {
      route: 'seat_selection',
      number: '02',
      label: 'Seat',
      reachable: Boolean(selectedTheaterId),
    },
    {
      route: 'video_upload',
      number: '03',
      label: 'Upload',
      reachable: Boolean(selectedTheaterId && selectedSeatId),
    },
    {
      route: 'confirmation',
      number: '04',
      label: 'Confirm',
      reachable: Boolean(selectedTheaterId && selectedSeatId && playlist.length > 0),
    },
  ];

  return (
    <div className="border-b border-white/[0.06] bg-[#0B0C10]">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 overflow-x-auto px-6 py-3 lg:px-10">
        {steps.map((step, idx) => {
          const isCurrent = route === step.route;
          return (
            <React.Fragment key={step.route}>
              <button
                type="button"
                disabled={!step.reachable}
                onClick={() => step.reachable && navigate(step.route)}
                className={`flex items-center gap-2 text-xs whitespace-nowrap shrink-0 transition-colors ${
                  isCurrent
                    ? 'font-semibold text-[#E5C158]'
                    : step.reachable
                      ? 'text-neutral-300 hover:text-white cursor-pointer'
                      : 'text-neutral-600 cursor-not-allowed'
                }`}
              >
                <span className="font-mono-tabular">{step.number}.</span>
                <span>{step.label}</span>
              </button>
              {idx < steps.length - 1 && (
                <span className="text-neutral-700 text-xs select-none" aria-hidden="true">
                  /
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
