import { useState, useEffect } from 'react';
import { StudentsPage } from './pages/StudentsPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClinicPage } from './pages/ClinicPage';
import { AttendancePage } from './pages/AttendancePage';
import { ExceptionsPage } from './pages/ExceptionsPage';
import { CommentsPage } from './pages/CommentsPage';
import { HandoverNotesPage } from './pages/HandoverNotesPage';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { WeeklySchedulePage } from './pages/WeeklySchedulePage';
import { WindowHeader } from './components/WindowHeader';
import { WindowResizeBorders } from './components/WindowResizeBorders';
import {
  AttendanceIcon,
  CalendarIcon,
  ClassIcon,
  ClinicIcon,
  ClockIcon,
  CommentIcon,
  ExceptionIcon,
  HandoverIcon,
  HomeIcon,
  StudentIcon
} from './components/icons';

type Tab =
  | 'dashboard'
  | 'calendar'
  | 'schedule'
  | 'students'
  | 'classes'
  | 'clinics'
  | 'attendance'
  | 'exceptions'
  | 'comments'
  | 'handover';

const TAB_TITLES: Record<Tab, string> = {
  dashboard: '종합 대시보드',
  calendar: '통합 캘린더',
  schedule: '수업일정',
  students: '학생 관리',
  classes: '수업 관리',
  clinics: '클리닉 배정',
  attendance: '출결 현황',
  exceptions: '일정 예외 관리',
  comments: '학생 코멘트',
  handover: '인수인계 메모'
};

export function App() {
  const [tab, setTab] = useState<Tab>('students');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
      if (typeof window.electronAPI.onMaximizedChange === 'function') {
        const cleanup = window.electronAPI.onMaximizedChange((maximized) => {
          setIsMaximized(maximized);
        });
        return cleanup;
      }
    }
  }, []);

  const handleMaximizeToggle = () => {
    if (window.electronAPI) {
      window.electronAPI.maximize();
    } else {
      setIsMaximized((prev) => !prev);
    }
  };

  const handleSidebarResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);

    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 180), 420);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSidebarReset = () => {
    setSidebarWidth(240);
  };

  return (
    <div className={`app-window-wrapper ${isMaximized ? 'is-maximized' : 'is-windowed'}`}>
      {/* Notion Window Custom Titlebar with Close / Minimize / Maximize */}
      <WindowHeader
        title="TheAll Messenger"
        activeTabTitle={TAB_TITLES[tab]}
        isMaximized={isMaximized}
        onMaximizeToggle={handleMaximizeToggle}
      />

      {/* 8-Edge Window Resize Cursors (Windowed mode only) */}
      {!isMaximized && <WindowResizeBorders />}

      <div className="app-container">
        {/* Notion Sidebar */}
        <aside className="app-sidebar" style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}>
        {/* Workspace Brand */}
        <div className="workspace-header">
          <div className="workspace-avatar">TA</div>
          <div className="workspace-meta">
            <div className="workspace-title">TheAll 학원</div>
            <div className="workspace-subtitle">선생님 / 조교 워크스페이스</div>
          </div>
        </div>

        {/* Overview & Relational Views */}
        <div className="sidebar-section-title">메인 뷰</div>
        <div className="sidebar-nav">
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setTab('dashboard')}
          >
            <HomeIcon size={16} className="nav-icon" />
            <span>대시보드</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'calendar' ? 'active' : ''}`}
            onClick={() => setTab('calendar')}
          >
            <CalendarIcon size={16} className="nav-icon" />
            <span>통합 캘린더</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'schedule' ? 'active' : ''}`}
            onClick={() => setTab('schedule')}
          >
            <ClockIcon size={16} className="nav-icon" />
            <span>수업일정</span>
          </button>
        </div>

        {/* Database Tables */}
        <div className="sidebar-section-title">데이터베이스</div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'students' ? 'active' : ''}`}
            onClick={() => setTab('students')}
          >
            <StudentIcon size={16} className="nav-icon" />
            <span>학생</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'classes' ? 'active' : ''}`}
            onClick={() => setTab('classes')}
          >
            <ClassIcon size={16} className="nav-icon" />
            <span>수업</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'clinics' ? 'active' : ''}`}
            onClick={() => setTab('clinics')}
          >
            <ClinicIcon size={16} className="nav-icon" />
            <span>클리닉</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'attendance' ? 'active' : ''}`}
            onClick={() => setTab('attendance')}
          >
            <AttendanceIcon size={16} className="nav-icon" />
            <span>출결</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'exceptions' ? 'active' : ''}`}
            onClick={() => setTab('exceptions')}
          >
            <ExceptionIcon size={16} className="nav-icon" />
            <span>일정 예외</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'comments' ? 'active' : ''}`}
            onClick={() => setTab('comments')}
          >
            <CommentIcon size={16} className="nav-icon" />
            <span>코멘트</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${tab === 'handover' ? 'active' : ''}`}
            onClick={() => setTab('handover')}
          >
            <HandoverIcon size={16} className="nav-icon" />
            <span>인수인계</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span>실시간 동기화 중</span>
          </div>
        </div>
      </aside>

      {/* Sidebar Splitter Resizer Handle with Col-Resize Cursor */}
      <div
        className={`sidebar-resizer ${isResizingSidebar ? 'is-resizing' : ''}`}
        onMouseDown={handleSidebarResizeMouseDown}
        onDoubleClick={handleSidebarReset}
        title="드래그하여 사이드바 너비 조절 (더블클릭 시 기본 크기 복귀)"
        role="separator"
        aria-orientation="vertical"
      />

      {/* Main Content Area */}
      <main className="app-main-content">
        <header className="top-header">
          <div className="breadcrumbs">
            <span className="crumb-root">TheAll Messenger</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{TAB_TITLES[tab]}</span>
          </div>
        </header>

        <div className="page-content">
          {tab === 'dashboard' && <DashboardPage onNavigateTab={(t) => setTab(t as Tab)} />}
          {tab === 'calendar' && <CalendarPage />}
          {tab === 'schedule' && <WeeklySchedulePage />}
          {tab === 'students' && <StudentsPage />}
          {tab === 'classes' && <ClassesPage />}
          {tab === 'clinics' && <ClinicPage />}
          {tab === 'attendance' && <AttendancePage />}
          {tab === 'exceptions' && <ExceptionsPage />}
          {tab === 'comments' && <CommentsPage />}
          {tab === 'handover' && <HandoverNotesPage />}
        </div>
      </main>
    </div>
    </div>
  );
}
