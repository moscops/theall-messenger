import { useState } from 'react';
import type { Student } from '@theall/shared';

interface StudentMultiSelectProps {
  students: Student[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
}

export function StudentMultiSelect({ students, selectedIds, onChange, excludeId }: StudentMultiSelectProps) {
  const [search, setSearch] = useState('');

  const candidates = students.filter((student) => student.id !== excludeId);
  const filtered = candidates.filter((student) => student.name.includes(search));
  const selected = candidates.filter((student) => selectedIds.includes(student.id));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div>
      {selected.length > 0 && (
        <div>
          {selected.map((student) => (
            <span key={student.id}>
              {student.name}
              <button type="button" onClick={() => toggle(student.id)}>
                x
              </button>
            </span>
          ))}
        </div>
      )}
      <input placeholder="학생 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        {filtered.map((student) => (
          <label key={student.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(student.id)}
              onChange={() => toggle(student.id)}
            />
            {student.name}
          </label>
        ))}
      </div>
    </div>
  );
}
