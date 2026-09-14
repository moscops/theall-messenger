import type { RosterEntry } from '@theall/shared';

export interface OverdueEntry extends RosterEntry {
  key: string;
}

function minutesSinceMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function findOverdueEntries(
  roster: RosterEntry[],
  nowMinutes: number,
  delayMinutes: number
): OverdueEntry[] {
  return roster
    .filter((entry) => !entry.checkedIn)
    .filter((entry) => nowMinutes - minutesSinceMidnight(entry.startTime) >= delayMinutes)
    .map((entry) => ({ ...entry, key: `${entry.studentId}:${entry.sourceId}:${entry.startTime}` }));
}
