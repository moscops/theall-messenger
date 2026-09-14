import { useState } from 'react';
import { StudentsPage } from './pages/StudentsPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClinicPage } from './pages/ClinicPage';
import { AttendancePage } from './pages/AttendancePage';
import { ExceptionsPage } from './pages/ExceptionsPage';
import { CommentsPage } from './pages/CommentsPage';
import { HandoverNotesPage } from './pages/HandoverNotesPage';

type Tab = 'students' | 'classes' | 'clinics' | 'attendance' | 'exceptions' | 'comments' | 'handover';

const TAB_TITLES: Record<Tab, string> = {
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

  return (
    <div className="app-container">
      <aside className="app-sidebar">
        <div className="workspace-header">
          <div className="workspace-avatar">TA</div>
          <div className="workspace-meta">
            <div className="workspace-title">TheAll 학원</div>
            <div className="workspace-subtitle">선생님 / 조교 워크스페이스</div>
          </div>
        </div>

        <div className="sidebar-section-title">데이터베이스</div>
        <nav className="sidebar-nav">
          <button
            data-tab="students"
            className={`nav-tab-btn ${tab === 'students' ? 'active' : ''}`}
            onClick={() => setTab('students')}
          >
            학생
          </button>
          <button
            data-tab="classes"
            className={`nav-tab-btn ${tab === 'classes' ? 'active' : ''}`}
            onClick={() => setTab('classes')}
          >
            수업
          </button>
          <button
            data-tab="clinics"
            className={`nav-tab-btn ${tab === 'clinics' ? 'active' : ''}`}
            onClick={() => setTab('clinics')}
          >
            클리닉
          </button>
          <button
            data-tab="attendance"
            className={`nav-tab-btn ${tab === 'attendance' ? 'active' : ''}`}
            onClick={() => setTab('attendance')}
          >
            출결
          </button>
          <button
            data-tab="exceptions"
            className={`nav-tab-btn ${tab === 'exceptions' ? 'active' : ''}`}
            onClick={() => setTab('exceptions')}
          >
            일정 예외
          </button>
          <button
            data-tab="comments"
            className={`nav-tab-btn ${tab === 'comments' ? 'active' : ''}`}
            onClick={() => setTab('comments')}
          >
            코멘트
          </button>
          <button
            data-tab="handover"
            className={`nav-tab-btn ${tab === 'handover' ? 'active' : ''}`}
            onClick={() => setTab('handover')}
          >
            인수인계
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span>실시간 연결됨</span>
          </div>
        </div>
      </aside>

      <main className="app-main-content">
        <header className="top-header">
          <div className="breadcrumbs">
            <span className="crumb-root">TheAll Messenger</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{TAB_TITLES[tab]}</span>
          </div>
        </header>

        <div className="page-content">
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
  );
}
