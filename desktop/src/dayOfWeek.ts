export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function formatDayOfWeek(dayOfWeek: number): string {
  return `${DAY_LABELS[dayOfWeek] ?? dayOfWeek}요일`;
}
