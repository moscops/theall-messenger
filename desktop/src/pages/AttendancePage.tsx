import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoShowAlertConfigInput, RosterEntry } from '@theall/shared';
import { alertConfigApi, attendanceApi } from '../api/client';
import { useLiveRefresh } from '../api/useLiveRefresh';
import { logger } from '../logger';
import { findOverdueEntries } from '../attendanceAlerts';
import { todayLocal } from '../date';

const CHECK_INTERVAL_MS = 30_000;

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function AttendancePage() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [savedConfig, setSavedConfig] = useState<NoShowAlertConfigInput>({ enabled: false, delayMinutes: 10 });
  const [draftConfig, setDraftConfig] = useState<NoShowAlertConfigInput>({ enabled: false, delayMinutes: 10 });
  const [error, setError] = useState<string | null>(null);
  const notifiedKeys = useRef(new Set<string>());

  const refresh = useCallback(() => {
    attendanceApi.roster(todayLocal()).then(setRoster).catch((error: unknown) => logger.error(error));
  }, []);

  const refreshConfig = useCallback(() => {
    alertConfigApi
      .get()
      .then((config) => {
        setSavedConfig(config);
        setDraftConfig(config);
      })
      .catch((error: unknown) => logger.error(error));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(refreshConfig, [refreshConfig]);
  useLiveRefresh('attendance', refresh);
  useLiveRefresh('attendance', refreshConfig);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!savedConfig.enabled) return;
    const interval = setInterval(() => {
      const overdue = findOverdueEntries(roster, nowMinutes(), savedConfig.delayMinutes);
      for (const entry of overdue) {
        const key = `${todayLocal()}:${entry.key}`;
        if (notifiedKeys.current.has(key)) continue;
        notifiedKeys.current.add(key);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('미출석 알림', {
            body: `${entry.studentName} - ${entry.label} (${entry.startTime})`
          });
        }
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [roster, savedConfig]);

  useEffect(() => {
    notifiedKeys.current.clear();
  }, [savedConfig]);

  const handleCheckIn = async (studentId: string) => {
    try {
      await attendanceApi.checkIn({ studentId, date: todayLocal(), checkInTime: currentTime() });
      setError(null);
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  const handleConfigSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const updated = await alertConfigApi.update(draftConfig);
      setSavedConfig(updated);
      setDraftConfig(updated);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error(err);
      setError(message);
    }
  };

  return (
    <div>
      <h2>출결 ({todayLocal()})</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table>
        <thead>
          <tr>
            <th>학생</th>
            <th>수업/클리닉</th>
            <th>시간</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {roster.map((entry) => (
            <tr key={`${entry.studentId}-${entry.sourceId}-${entry.startTime}`}>
              <td>{entry.studentName}</td>
              <td>{entry.label}</td>
              <td>
                {entry.startTime}-{entry.endTime}
              </td>
              <td>{entry.checkedIn ? `등원 완료 (${entry.checkInTime})` : '미등원'}</td>
              <td>
                {!entry.checkedIn && (
                  <button className="btn-checkin" onClick={() => handleCheckIn(entry.studentId)}>
                    체크인
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleConfigSubmit}>
        <p>미출석 알림</p>
        <label>
          <input
            type="checkbox"
            checked={draftConfig.enabled}
            onChange={(e) => setDraftConfig({ ...draftConfig, enabled: e.target.checked })}
          />
          알림 켜기
        </label>
        <input
          type="number"
          min={1}
          max={120}
          value={draftConfig.delayMinutes}
          onChange={(e) => setDraftConfig({ ...draftConfig, delayMinutes: Number(e.target.value) })}
        />
        <button type="submit">저장</button>
      </form>
    </div>
  );
}
