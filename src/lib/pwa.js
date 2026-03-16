import { supabase } from './supabase';

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications.');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  
  // This would usually involve a VAPID public key from a server
  // For now, we just return the registration to confirm it's ready
  return registration;
}

export async function checkNotificationSupport() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}
