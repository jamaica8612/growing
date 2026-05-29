import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// Persist one value to localStorage, surfacing quota/serialization errors to
// the user instead of silently dropping their data.
export function persist(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to persist "${key}" to localStorage:`, error);
    const isQuota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    alert(
      isQuota
        ? '브라우저 저장 공간이 가득 차 데이터를 저장하지 못했습니다.\n[안전 백업 설정]에서 백업 파일을 받은 뒤 오래된 출결/상담 기록을 정리해 주세요.'
        : '데이터를 저장하는 중 오류가 발생했습니다. 변경 내용이 저장되지 않았을 수 있으니 백업을 권장합니다.'
    );
  }
}

// State that mirrors itself to localStorage: the initial value is read from
// storage (falling back to `fallback`), and every subsequent change is written
// back automatically. This removes the manual setState + saveToLocal pairing
// that every mutation used to repeat.
export function usePersistentState<T>(
  key: string,
  fallback: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    persist(key, value);
  }, [key, value]);

  return [value, setValue];
}
