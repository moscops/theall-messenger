# TheAll Messenger — 캘린더 & 엑셀/PDF 내보내기 설계 (서브프로젝트 4)

## 배경 및 목표

서브프로젝트 1~3(학생/수업/클리닉 마스터 데이터, 출결 & 예외사항, 인수인계 메모)이
모두 완료된 상태에서, 마지막 서브프로젝트는 지금까지 쌓인 데이터를 **날짜 범위로
조회하고 엑셀/PDF로 내보내는** 기능이다. 마스터 설계 문서
(`2026-09-13-student-database-design.md`)는 이 부분의 화면 레이아웃, 필터링,
내보내기 포맷의 구체적인 사양을 이 서브프로젝트의 설계 단계로 명시적으로
미뤄뒀다. 이 문서가 그 사양을 확정한다.

## 범위: 이번 서브프로젝트가 다루는 것 / 다루지 않는 것

데스크톱 UI 디자인 작업은 별도로(제미나이) 진행되므로, 이 서브프로젝트는
**백엔드(데이터 계산 + REST API + 파일 생성)까지만** 다룬다.

**다루는 것:**
- 날짜 범위로 "그 기간에 어떤 일정/기록이 있었는지"를 계산하는 서비스
- 그 결과를 반환하는 REST API
- 같은 데이터를 엑셀/PDF 파일로 만들어 내려주는 API

**다루지 않는 것 (제미나이 담당):**
- 실제 달력 그리드/월간뷰 컴포넌트
- 카테고리 필터 UI, 학생 필터 UI, 내보내기 버튼
- 색상 코드의 실제 시각 디자인 (카테고리 값 자체는 이 문서에서 정의하지만,
  그 값을 어떤 색으로 렌더링할지는 UI 쪽 결정)

## 아키텍처

기존 `computeRoster(db, date)`(서브프로젝트 2)와 목적이 다른 별도의 새 서비스
`computeCalendarEvents(db, from, to)`를 추가한다. `computeRoster`는 "지금 이
순간 와야 할 학생"이라는 하루치 현재 상태를 계산하는 반면, 캘린더는 여러 날에
걸쳐 "그날 어떤 일이 있었는지"를 있는 그대로 나열해야 한다 — 특히 **결석은
목록에서 사라지는 게 아니라 "결석했다는 사실"로 표시되어야 한다**. 이 차이
때문에 로직은 비슷해도(반복 일정 + ScheduleException 조합) 별도 함수로 둔다.

엑셀/PDF 내보내기는 `computeCalendarEvents`가 만든 같은 이벤트 목록을 그대로
표로 옮기는 것이므로, 캘린더 계산과 내보내기 포맷팅을 분리한다
(`services/calendar.ts` vs `services/export.ts`).

## 데이터 모델

### CalendarEventCategory

```typescript
export const calendarEventCategorySchema = z.enum([
  'regular_class',
  'clinic',
  'absence',
  'reschedule',
  'makeup'
]);
```

### CalendarEvent

| 필드 | 타입 | 설명 |
|---|---|---|
| date | string (YYYY-MM-DD) | 이 이벤트가 실제로 발생하는(발생했어야 하는) 날짜 |
| studentId | string | |
| studentName | string | |
| category | CalendarEventCategory | 아래 "카테고리 산출 규칙" 참고 |
| label | string | 수업명 또는 '클리닉' — `computeRoster`와 동일한 관례 |
| startTime | string (HH:MM) | |
| endTime | string (HH:MM) | |

카테고리별로 studentId/label/startTime/endTime의 출처가 다르지만, 반환되는
모양(shape)은 하나로 통일한다 — 프론트에서 하나의 배열을 순회하며 카테고리로
분기하면 되도록.

### 카테고리 산출 규칙

`computeRoster`의 로직(반복 일정 + `schedule_exceptions` 반영)을 그대로
재사용하되, 결과를 다루는 방식이 다르다:

1. 그 날짜의 요일에 해당하는 모든 Class/ClinicAssignment 반복 일정을
   `category: 'regular_class'` 또는 `'clinic'`으로 나열한다 (`computeRoster`의
   `classRows`/`clinicRows` 쿼리를 그대로 재사용).
2. 그 날짜에 `exception_type = 'absence'`인 `schedule_exceptions`가 있으면 —
   `computeRoster`처럼 항목을 **제거하지 않고**, 매칭되는 항목의
   `category`를 `'absence'`로 바꾼다 (studentId/label/startTime/endTime은
   원래 정규수업/클리닉 값 그대로 유지 — "몇 시 수업을 결석했는지"가 보여야
   하므로).
3. 그 날짜에 `exception_type = 'reschedule'`인 `schedule_exceptions`가
   있으면 — 원래 날짜의 항목은 2번과 마찬가지로 `category: 'absence'`가
   아니라 **제거**한다 (이미 다른 날로 옮겨졌으므로 원래 자리에 "결석"으로
   보이면 안 됨). 대신 `COALESCE(se.new_date, se.date) = ?` 매칭으로(서브
   프로젝트 2의 `roster.ts`에서 이미 검증된 패턴) 새 날짜 쪽 목록에
   `category: 'reschedule'`, `startTime`/`endTime`은 `new_start_time`/
   `new_end_time`으로 항목을 추가한다.
4. `exception_type = 'makeup'`인 경우 — 원래 정규 일정에는 영향 없음(보충은
   추가되는 세션이지 원래 수업을 대체하는 게 아님). `COALESCE(se.new_date,
   se.date) = ?` 매칭으로 그 날짜 목록에 `category: 'makeup'`을 추가한다.

이 규칙은 `roster.ts`의 검증된 SQL 패턴(특히 `makeup`이 `new_date`를 쓰지
않는다는 서브프로젝트 2 최종 리뷰에서 확정된 규칙)을 그대로 재사용한다 —
새로 발명하지 않는다.

## API 엔드포인트

### `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

```typescript
ApiResponse<CalendarEvent[]>
```

- `from`/`to` 둘 다 필수, `YYYY-MM-DD` 형식(기존 `dateStringSchema` 재사용).
- `from <= to`가 아니면 400.
- `to - from`이 90일을 초과하면 400 (과도한 쿼리 방지 — 서버가 그 구간의
  매일에 대해 반복 계산을 수행하므로 무제한 범위를 막는다).
- 필터링(카테고리별, 학생별)은 이 API에 파라미터로 넣지 않는다 — 학원
  규모상 몇 주 치 이벤트를 한 번에 내려줘도 가볍고, 필터는 클라이언트에서
  받은 배열을 걸러서 처리하는 쪽이 API를 단순하게 유지한다.

### `GET /export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD`

- 위와 동일한 날짜 검증.
- `computeCalendarEvents`로 이벤트를 계산한 뒤 `exceljs`로 하나의 시트에
  날짜 → 학생명 → 카테고리(한글 라벨) → 시간 순으로 표를 만들어
  `.xlsx` 바이너리를 반환한다.
- 응답 헤더: `Content-Type:
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `Content-Disposition: attachment; filename="theall-calendar-<from>_<to>.xlsx"`.

### `GET /export/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD`

- 위와 동일한 날짜 검증.
- 같은 이벤트 목록을 `pdfkit`으로 표 형태 문서를 그려 `.pdf` 바이너리로
  반환한다.
- 응답 헤더: `Content-Type: application/pdf`, `Content-Disposition:
  attachment; filename="theall-calendar-<from>_<to>.pdf"`.

라이브러리는 `exceljs`(엑셀)와 `pdfkit`(PDF) — 둘 다 순수 JavaScript로,
네이티브 빌드나 Chromium 같은 무거운 런타임 의존성이 없다. 이 프로젝트가
`better-sqlite3`의 네이티브 빌드 문제를 여러 번 겪었던 것을 고려한 선택이다.

## 에러 처리

기존 `/attendance/roster`와 동일한 관례: 날짜 파라미터가 없거나 형식이
틀리면 `ApiResponse<never>`로 400을 반환한다. `from > to`이거나 범위가
90일을 초과하는 경우도 같은 방식으로 400. 세 엔드포인트(`/calendar`,
`/export/excel`, `/export/pdf`) 모두 같은 검증 로직을 공유한다(중복
방지를 위해 공유 헬퍼로 추출).

## 테스트 전략

**`computeCalendarEvents` 단위 테스트** (`:memory:` SQLite, 서브프로젝트
2의 `roster.test.ts`와 동일한 스타일):
- 정규 수업이 해당 요일에 포함되는지
- 클리닉이 해당 요일에 포함되는지
- 결석 예외가 있는 날짜에 해당 항목이 **삭제되지 않고** `category:
  'absence'`로 바뀌는지 (그리고 그 항목의 studentId/label/시간이 원래
  값 그대로인지)
- 시간변경 예외가 원래 날짜에서는 사라지고 새 날짜에 `category:
  'reschedule'`로 새 시간과 함께 나타나는지
- 보충 예외가 원래 정규 일정에 영향 없이 새 날짜에 `category: 'makeup'`으로
  추가되는지 (서브프로젝트 2에서 발견됐던 "makeup의 new_date가 NULL일 수
  있다" 버그 패턴을 반드시 재현하는 테스트 포함 — `COALESCE` 매칭이 이
  서비스에서도 올바르게 동작하는지 확인)
- 여러 날짜에 걸친 범위 조회 시 날짜별로 올바르게 집계되는지

**라우트 테스트** (supertest):
- `GET /calendar` 정상 응답, 날짜 누락/형식오류/범위(from>to, 90일 초과)
  400
- `GET /export/excel` 정상 응답 시 `Content-Type`/`Content-Disposition`
  확인, 반환된 버퍼를 `exceljs`로 다시 읽어서 행 수가 이벤트 개수와
  일치하는지 확인
- `GET /export/pdf` 정상 응답 시 `Content-Type` 확인, 버퍼가 비어있지
  않은지 확인 (PDF 내용 자체를 파싱해서 검증하는 건 이 범위 밖 — 버퍼
  생성 성공 여부만 확인)

## 이 설계에서 다루지 않는 것

- 실제 캘린더 UI 컴포넌트, 필터 UI, 내보내기 버튼 — 데스크톱 UI 담당자
  (제미나이) 몫.
- 카테고리별 색상의 실제 디자인 값(hex 코드 등) — UI 쪽에서 결정.
- 학생별 출결 집계 리포트 같은 다른 형태의 내보내기 — 필요해지면 별도
  서브프로젝트/후속 작업으로.
- 엑셀/PDF의 회사 로고, 헤더/푸터 등 서식 디테일 — 최소 기능(날짜/학생명/
  카테고리/시간이 담긴 표)만 우선 구현.
