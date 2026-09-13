import type { ScheduleSlotInput } from '@theall/shared';
import { DAY_LABELS } from '../dayOfWeek';

interface ScheduleSlotsEditorProps {
  slots: ScheduleSlotInput[];
  onChange: (slots: ScheduleSlotInput[]) => void;
}

export function ScheduleSlotsEditor({ slots, onChange }: ScheduleSlotsEditorProps) {
  const updateSlot = (index: number, patch: Partial<ScheduleSlotInput>) => {
    onChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const removeSlot = (index: number) => {
    onChange(slots.filter((_, i) => i !== index));
  };

  const addSlot = () => {
    const last = slots[slots.length - 1] ?? { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' };
    onChange([...slots, { ...last }]);
  };

  return (
    <div>
      {slots.map((slot, index) => (
        <div key={index}>
          <select
            value={slot.dayOfWeek}
            onChange={(e) => updateSlot(index, { dayOfWeek: Number(e.target.value) })}
          >
            {DAY_LABELS.map((label, day) => (
              <option key={day} value={day}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={slot.startTime}
            onChange={(e) => updateSlot(index, { startTime: e.target.value })}
          />
          <input
            type="time"
            value={slot.endTime}
            onChange={(e) => updateSlot(index, { endTime: e.target.value })}
          />
          {slots.length > 1 && (
            <button type="button" onClick={() => removeSlot(index)}>
              삭제
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addSlot}>
        시간대 추가
      </button>
    </div>
  );
}
