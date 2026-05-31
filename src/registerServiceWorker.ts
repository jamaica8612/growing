export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const swUrl = `${baseUrl}sw.js`;
    void navigator.serviceWorker.register(swUrl, { scope: baseUrl }).catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
