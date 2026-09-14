import type { CalendarEventCategory } from '@theall/shared';

export const CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  regular_class: '정규수업',
  clinic: '클리닉',
  absence: '결석',
  reschedule: '시간변경',
  makeup: '보충'
};
