import { useState } from 'react';
import { StudentsPage } from './pages/StudentsPage';
import { ClassesPage } from './pages/ClassesPage';
import { ClinicPage } from './pages/ClinicPage';

type Tab = 'students' | 'classes' | 'clinics';

export function App() {
  const [tab, setTab] = useState<Tab>('students');

  return (
    <div>
      <nav>
        <button onClick={() => setTab('students')}>학생</button>
        <button onClick={() => setTab('classes')}>수업</button>
        <button onClick={() => setTab('clinics')}>클리닉</button>
      </nav>
      {tab === 'students' && <StudentsPage />}
      {tab === 'classes' && <ClassesPage />}
      {tab === 'clinics' && <ClinicPage />}
    </div>
  );
}
