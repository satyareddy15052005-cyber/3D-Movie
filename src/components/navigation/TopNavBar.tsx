import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useCinemaStore } from '../../store/cinemaStore';

interface TopNavBarProps {
  onOpenAbout: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({ onOpenAbout }) => {
  const { route, navigate, setSettingsOpen, selectedTheaterId } = useCinemaStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (target: 'home' | 'theaters' | 'about' | 'settings') => {
    setMobileMenuOpen(false);
    if (target === 'home') {
      navigate('home');
    } else if (target === 'theaters') {
      navigate('theaters');
    } else if (target === 'about') {
      if (route !== 'home') {
        navigate('home');
        window.setTimeout(onOpenAbout, 120);
      } else {
        onOpenAbout();
      }
    } else if (target === 'settings') {
      setSettingsOpen(true);
    }
  };

  const handlePrimaryCta = () => {
    setMobileMenuOpen(false);
    if (selectedTheaterId) {
      navigate('theater_details');
    } else {
      navigate('theaters');
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070709]/92">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4 lg:px-10">
        {/* Zone 1: Brand Wordmark (single clean element) */}
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="font-display text-xl font-semibold tracking-wide text-[#F4F1EA] whitespace-nowrap shrink-0 cursor-pointer hover:text-[#D4AF37] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/70 rounded"
        >
          Aurelia Cinema
        </button>

        {/* Zone 2: 4 Clean Single-Line Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-300">
          <button
            type="button"
            onClick={() => handleNavClick('home')}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-[#F4F1EA] ${
              route === 'home' ? 'text-[#D4AF37]' : ''
            }`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('theaters')}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-[#F4F1EA] ${
              route === 'theaters' || route === 'theater_details' ? 'text-[#D4AF37]' : ''
            }`}
          >
            Theaters
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('about')}
            className="whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-[#F4F1EA]"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('settings')}
            className="whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-[#F4F1EA]"
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action + Mobile Menu Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handlePrimaryCta}
            className="hidden sm:inline-flex items-center justify-center rounded-md bg-[#D4AF37] px-5 py-2.5 text-xs font-semibold tracking-wider text-[#070709] uppercase whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:bg-[#E5C158] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          >
            Enter Cinema
          </button>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex md:hidden h-10 w-10 items-center justify-center rounded-md border border-white/10 text-neutral-200 hover:bg-white/5"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/[0.08] bg-[#0B0C10] px-6 py-4 space-y-2">
          <button
            type="button"
            onClick={() => handleNavClick('home')}
            className="block w-full py-2.5 text-left text-sm font-medium text-neutral-200 hover:text-[#D4AF37]"
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('theaters')}
            className="block w-full py-2.5 text-left text-sm font-medium text-neutral-200 hover:text-[#D4AF37]"
          >
            Theaters
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('about')}
            className="block w-full py-2.5 text-left text-sm font-medium text-neutral-200 hover:text-[#D4AF37]"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('settings')}
            className="block w-full py-2.5 text-left text-sm font-medium text-neutral-200 hover:text-[#D4AF37]"
          >
            Settings
          </button>
          <div className="pt-2">
            <button
              type="button"
              onClick={handlePrimaryCta}
              className="w-full rounded-md bg-[#D4AF37] px-4 py-3 text-xs font-semibold tracking-wider text-[#070709] uppercase"
            >
              Enter Cinema
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
