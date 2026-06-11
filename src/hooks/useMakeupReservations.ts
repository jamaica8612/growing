import { useCallback, useEffect, useState } from 'react';
import type { MakeupReservation } from '../types';
import { api } from '../lib/api';

type SaveMakeupReservationInput = Omit<MakeupReservation, 'id' | 'createdAt' | 'status' | 'completedAt'> & {
  id?: string;
  status?: MakeupReservation['status'];
};

// 보강 예약을 Supabase(growing_makeup_reservations)에 저장한다. 알림장 내용이
// 이 데이터에 의존하므로 기기/브라우저별로 달라지면 안 된다 (localStorage 금지).
export function useMakeupReservations(userId: string) {
  const [reservations, setReservations] = useState<MakeupReservation[]>([]);

  const load = useCallback(async () => {
    try {
      setReservations(await api.listMakeupReservations());
    } catch (e) {
      console.error('Failed to load makeup reservations:', e);
    }
  }, []);

  useEffect(() => {
    // Canonical data-fetch on mount/owner-change (useAcademyData.load와 동일한 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, userId]);

  // DB 오류는 사용자에게 알리고 서버 상태로 재동기화한다 (useAcademyData.guard와 동일한 방침).
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error('Makeup reservation mutation failed:', e);
      alert(e instanceof Error ? `보강 예약 저장에 실패했습니다: ${e.message}` : '보강 예약 저장에 실패했습니다.');
      void load();
    }
  };

  const saveReservation = useCallback((input: SaveMakeupReservationInput) => {
    void guard(async () => {
      if (input.id) {
        const existing = reservations.find(item => item.id === input.id);
        if (!existing) return;
        const nextStatus = input.status ?? existing.status;
        const updated = await api.updateMakeupReservation(input.id, {
          scheduledDate: input.scheduledDate,
          scheduledTime: input.scheduledTime,
          sourceAbsenceDate: input.sourceAbsenceDate,
          reason: input.reason,
          memo: input.memo,
          status: nextStatus,
          completedAt:
            nextStatus === 'completed'
              ? (existing.completedAt ?? new Date().toISOString())
              : nextStatus === 'scheduled' ? undefined : existing.completedAt,
        });
        setReservations(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      } else {
        const created = await api.insertMakeupReservation({
          studentId: input.studentId,
          classId: input.classId,
          scheduledDate: input.scheduledDate,
          scheduledTime: input.scheduledTime,
          sourceAbsenceDate: input.sourceAbsenceDate,
          reason: input.reason,
          memo: input.memo,
          status: input.status ?? 'scheduled',
        });
        setReservations(prev => [...prev, created]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations]);

  const updateReservation = useCallback((id: string, patch: Partial<MakeupReservation>) => {
    void guard(async () => {
      const existing = reservations.find(item => item.id === id);
      if (!existing) return;
      const merged = { ...existing, ...patch };
      const nextStatus = patch.status ?? existing.status;
      const updated = await api.updateMakeupReservation(id, {
        scheduledDate: merged.scheduledDate,
        scheduledTime: merged.scheduledTime,
        sourceAbsenceDate: merged.sourceAbsenceDate,
        reason: merged.reason,
        memo: merged.memo,
        status: nextStatus,
        completedAt:
          nextStatus === 'completed'
            ? (patch.completedAt ?? existing.completedAt ?? new Date().toISOString())
            : nextStatus === 'scheduled' ? undefined : (patch.completedAt ?? existing.completedAt),
      });
      setReservations(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations]);

  const deleteReservation = useCallback((id: string) => {
    void guard(async () => {
      await api.deleteMakeupReservation(id);
      setReservations(prev => prev.filter(item => item.id !== id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { reservations, saveReservation, updateReservation, deleteReservation };
}
