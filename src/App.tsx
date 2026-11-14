import React, { useEffect, useRef } from 'react';
import { useCinemaStore } from './store/cinemaStore';
import { TopNavBar } from './components/navigation/TopNavBar';
import { SettingsModal } from './components/common/SettingsModal';
import { CinemaErrorBoundary } from './components/common/CinemaErrorBoundary';
import { HomePage } from './pages/Home/HomePage';
import { TheaterSelectionPage } from './pages/TheaterSelection/TheaterSelectionPage';
import { TheaterDetailsPage } from './pages/TheaterDetails/TheaterDetailsPage';
import { SeatSelectionPage } from './pages/SeatSelection/SeatSelectionPage';
import { VideoUploadPage } from './pages/VideoUpload/VideoUploadPage';
import { ConfirmationPage } from './pages/Confirmation/ConfirmationPage';
import { VirtualCinemaPage } from './pages/VirtualCinema/VirtualCinemaPage';

export default function App() {
  const route = useCinemaStore((s) => s.route);
  const resetShowSession = useCinemaStore((s) => s.resetShowSession);
  const rehydrateFromIndexedDb = useCinemaStore((s) => s.rehydrateFromIndexedDb);
  const aboutSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    rehydrateFromIndexedDb();
  }, [rehydrateFromIndexedDb]);

  const handleOpenAbout = () => {
    aboutSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (route === 'virtual_cinema') {
    return (
      <CinemaErrorBoundary onReturnHome={resetShowSession}>
        <VirtualCinemaPage />
        <SettingsModal />
      </CinemaErrorBoundary>
    );
  }

  return (
    <CinemaErrorBoundary onReturnHome={resetShowSession}>
      <div className="min-h-screen bg-[#070709] text-[#F4F1EA]">
        <TopNavBar onOpenAbout={handleOpenAbout} />
        <main>
          {route === 'home' && <HomePage aboutSectionRef={aboutSectionRef} />}
          {route === 'theaters' && <TheaterSelectionPage />}
          {route === 'theater_details' && <TheaterDetailsPage />}
          {route === 'seat_selection' && <SeatSelectionPage />}
          {route === 'video_upload' && <VideoUploadPage />}
          {route === 'confirmation' && <ConfirmationPage />}
        </main>
        <SettingsModal />
      </div>
    </CinemaErrorBoundary>
  );
}
