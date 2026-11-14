import React from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

interface CinemaErrorBoundaryProps {
  children: React.ReactNode;
  onReturnHome?: () => void;
}

interface CinemaErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class CinemaErrorBoundary extends React.Component<
  CinemaErrorBoundaryProps,
  CinemaErrorBoundaryState
> {
  constructor(props: CinemaErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): CinemaErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected rendering or media playback error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    // Keep silent in UI; state handles recovery cleanly
    void error;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#070709] p-6 text-center text-[#F4F1EA]">
          <div className="max-w-md rounded-2xl border border-white/15 bg-[#0E0F13] p-8 space-y-4">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#D4AF37]" />
            <h2 className="font-display text-3xl font-semibold">Screening Interrupted</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">{this.state.message}</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center gap-2 rounded-md border border-white/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-200 hover:border-[#D4AF37] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry View</span>
              </button>
              {this.props.onReturnHome && (
                <button
                  type="button"
                  onClick={() => {
                    this.setState({ hasError: false, message: '' });
                    this.props.onReturnHome?.();
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-[#D4AF37] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#070709] hover:bg-[#E5C158] cursor-pointer"
                >
                  <Home className="h-3.5 w-3.5" />
                  <span>Return Home</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
