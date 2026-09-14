import { useEffect, useState } from 'react';

interface WindowHeaderProps {
  title: string;
  activeTabTitle: string;
  isMaximized?: boolean;
  onMaximizeToggle?: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void;
    };
  }
}

export function WindowHeader({
  title,
  activeTabTitle,
  isMaximized: controlledIsMaximized,
  onMaximizeToggle
}: WindowHeaderProps) {
  const [internalIsMaximized, setInternalIsMaximized] = useState(false);

  const isMaximized = controlledIsMaximized !== undefined ? controlledIsMaximized : internalIsMaximized;

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setInternalIsMaximized).catch(() => {});
      if (typeof window.electronAPI.onMaximizedChange === 'function') {
        const cleanup = window.electronAPI.onMaximizedChange((maximized) => {
          setInternalIsMaximized(maximized);
        });
        return cleanup;
      }
    }
  }, []);

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (onMaximizeToggle) {
      onMaximizeToggle();
      return;
    }

    if (window.electronAPI) {
      window.electronAPI.maximize();
    } else {
      setInternalIsMaximized((prev) => !prev);
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.close();
    }
  };

  return (
    <div
      className="notion-titlebar"
      data-testid="notion-titlebar"
      onDoubleClick={handleMaximize}
    >
      {/* Left Brand Badge & Workspace Title (Windows Notion Style - No Traffic Lights) */}
      <div className="titlebar-left">
        <div className="titlebar-brand">
          <span className="app-badge-pill">TheAll</span>
          <span className="titlebar-app-title">{title}</span>
        </div>
      </div>

      {/* Center Draggable Navigation & Active Tab Breadcrumb */}
      <div className="titlebar-center">
        <span className="titlebar-sep">/</span>
        <span className="titlebar-tab-name">{activeTabTitle}</span>
      </div>

      {/* Right Windows Native Style Action Controls (Clean, Large, Clickable) */}
      <div className="window-action-controls">
        <button
          type="button"
          className="win-control-btn win-btn-minimize"
          onClick={handleMinimize}
          title="창 최소화 (Minimize)"
          aria-label="창 최소화"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          className="win-control-btn win-btn-maximize"
          onClick={handleMaximize}
          title={isMaximized ? '창 복원 (Restore)' : '창 최대화 (Maximize)'}
          aria-label={isMaximized ? '창 복원' : '창 최대화'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="1" y="3" width="6" height="6" />
              <path d="M3 3 V1 H9 V7 H7" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1" y="1" width="8" height="8" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="win-control-btn win-btn-close"
          onClick={handleClose}
          title="창 닫기 (Close)"
          aria-label="창 닫기"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
