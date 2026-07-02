// 컴포넌트 간 단발 이벤트 전달용 버스.
// 구독자가 없을 때 도착한 이벤트는 버퍼에 보관했다가 다음 구독 시 전달한다.
// (예: 평가 관리 탭에서 아이비 위젯이 언마운트된 동안 온 상담 요청 알림)

export interface CounselNotification {
  studentName: string;
  message: string;
}

export interface NotificationBus<T> {
  emit: (value: T) => void;
  subscribe: (listener: (value: T) => void) => () => void;
}

export function createNotificationBus<T>(): NotificationBus<T> {
  let pending: T | null = null;
  let listener: ((value: T) => void) | null = null;
  return {
    emit(value: T) {
      if (listener) listener(value);
      else pending = value;
    },
    subscribe(fn: (value: T) => void) {
      listener = fn;
      if (pending !== null) {
        const buffered = pending;
        pending = null;
        queueMicrotask(() => {
          if (listener === fn) fn(buffered);
        });
      }
      return () => {
        if (listener === fn) listener = null;
      };
    },
  };
}
