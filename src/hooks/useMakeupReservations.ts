import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MakeupReservation } from '../types';

type SaveMakeupReservationInput = Omit<MakeupReservation, 'id' | 'createdAt' | 'status' | 'completedAt'> & {
  id?: string;
  status?: MakeupReservation['status'];
};

const storageKey = (ownerId: string) => `growing:makeup-reservations:${ownerId}`;

const safeParse = (value: string | null): MakeupReservation[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mk-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useMakeupReservations(ownerId: string) {
  const key = useMemo(() => storageKey(ownerId), [ownerId]);
  const [reservations, setReservations] = useState<MakeupReservation[]>(() =>
    safeParse(localStorage.getItem(key)),
  );

  useEffect(() => {
    setReservations(safeParse(localStorage.getItem(key)));
  }, [key]);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(reservations));
  }, [key, reservations]);

  const saveReservation = useCallback((input: SaveMakeupReservationInput) => {
    setReservations(prev => {
      const now = new Date().toISOString();
      if (input.id) {
        return prev.map(item =>
          item.id === input.id
            ? {
                ...item,
                ...input,
                status: input.status ?? item.status,
                completedAt: input.status === 'completed' ? (item.completedAt ?? now) : input.status === 'scheduled' ? undefined : item.completedAt,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          ...input,
          id: makeId(),
          status: input.status ?? 'scheduled',
          createdAt: now,
        },
      ];
    });
  }, []);

  const updateReservation = useCallback((id: string, patch: Partial<MakeupReservation>) => {
    setReservations(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const nextStatus = patch.status ?? item.status;
        return {
          ...item,
          ...patch,
          completedAt:
            nextStatus === 'completed'
              ? (patch.completedAt ?? item.completedAt ?? new Date().toISOString())
              : nextStatus === 'scheduled'
                ? undefined
                : (patch.completedAt ?? item.completedAt),
        };
      }),
    );
  }, []);

  const deleteReservation = useCallback((id: string) => {
    setReservations(prev => prev.filter(item => item.id !== id));
  }, []);

  return { reservations, saveReservation, updateReservation, deleteReservation };
}
