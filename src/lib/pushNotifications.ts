import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'BFtv3sl3qtdN2sCUZLmbou68P4pThOWmzexFpFo_PZVepT7f3UEq62K-Nw3576wdy7md-nIMNKD0BkGcDICvzcs';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export async function subscribePushNotifications(userId: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  await supabase.from('growing_push_subscriptions').upsert({
    owner_id: userId,
    endpoint: json.endpoint,
    p256dh: (json.keys as Record<string, string>)?.p256dh ?? '',
    auth: (json.keys as Record<string, string>)?.auth ?? '',
  }, { onConflict: 'owner_id,endpoint' });

  return true;
}
