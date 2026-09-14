import { useState } from 'react';
import { StudentsPage } from './pages/StudentsPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClinicPage } from './pages/ClinicPage';
import { AttendancePage } from './pages/AttendancePage';
import { ExceptionsPage } from './pages/ExceptionsPage';
import { CommentsPage } from './pages/CommentsPage';

type Tab = 'students' | 'classes' | 'clinics' | 'attendance' | 'exceptions' | 'comments';

export function App() {
  const [tab, setTab] = useState<Tab>('students');

  return (
    <div>
      <nav>
        <button onClick={() => setTab('students')}>학생</button>
        <button onClick={() => setTab('classes')}>수업</button>
        <button onClick={() => setTab('clinics')}>클리닉</button>
        <button onClick={() => setTab('attendance')}>출결</button>
        <button onClick={() => setTab('exceptions')}>일정 예외</button>
        <button onClick={() => setTab('comments')}>코멘트</button>
      </nav>
      {tab === 'students' && <StudentsPage />}
      {tab === 'classes' && <ClassesPage />}
      {tab === 'clinics' && <ClinicPage />}
      {tab === 'attendance' && <AttendancePage />}
      {tab === 'exceptions' && <ExceptionsPage />}
      {tab === 'comments' && <CommentsPage />}
    </div>
  );
}
