import { useEffect, useState } from 'react';

interface WindowHeaderProps {
  title: string;
  activeTabTitle: string;
}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
    };
  }
}

export function WindowHeader({ title, activeTabTitle }: WindowHeaderProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      setIsElectron(true);
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
    }
  }, []);

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = async () => {
    if (window.electronAPI) {
      window.electronAPI.maximize();
      const maximized = await window.electronAPI.isMaximized();
      setIsMaximized(maximized);
    } else {
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.close();
    }
  };

  return (
    <div className="notion-titlebar" data-testid="notion-titlebar">
      {/* Left traffic lights (macOS Notion style) */}
      <div className="window-traffic-lights" aria-label="창 제어">
        <button
          type="button"
          className="traffic-btn traffic-close"
          onClick={handleClose}
          title="창 닫기 (Close)"
          aria-label="창 닫기"
        >
          <svg viewBox="0 0 12 12" className="traffic-symbol">
            <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="traffic-btn traffic-minimize"
          onClick={handleMinimize}
          title="창 최소화 / 내리기 (Minimize)"
          aria-label="창 최소화"
        >
          <svg viewBox="0 0 12 12" className="traffic-symbol">
            <line x1="2.5" y1="6" x2="9.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="traffic-btn traffic-maximize"
          onClick={handleMaximize}
          title={isMaximized ? '창 복원 (Restore)' : '창 최대화 (Maximize)'}
          aria-label="창 최대화"
        >
          <svg viewBox="0 0 12 12" className="traffic-symbol">
            <rect x="3" y="3" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>

      {/* Center Draggable App Title & Breadcrumb */}
      <div className="titlebar-center">
        <span className="app-badge-pill">TheAll</span>
        <span className="titlebar-text">{title}</span>
        <span className="titlebar-sep">/</span>
        <span className="titlebar-tab-name">{activeTabTitle}</span>
      </div>

      {/* Right Windows/Notion Style Action Controls */}
      <div className="window-action-controls">
        <button
          type="button"
          className="win-control-btn win-btn-minimize"
          onClick={handleMinimize}
          title="창 내리기 (최소화)"
          aria-label="창 내리기"
        >
          <svg width="11" height="11" viewBox="0 0 12 12">
            <rect x="1" y="6" width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          className="win-control-btn win-btn-maximize"
          onClick={handleMaximize}
          title={isMaximized ? '창 복원' : '창 최대화'}
          aria-label={isMaximized ? '창 복원' : '창 최대화'}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="1.5" y="3.5" width="7" height="7" />
              <path d="M3.5 3.5 V1.5 H10.5 V8.5 H8.5" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="1.5" y="1.5" width="9" height="9" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="win-control-btn win-btn-close"
          onClick={handleClose}
          title="창 닫기"
          aria-label="창 닫기"
        >
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
