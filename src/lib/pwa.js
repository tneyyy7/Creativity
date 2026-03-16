import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'BODZx_ji6d7QHMqGxuBFKfVj1-oZcELm52oRAv_Ozj1EPtY4OpazYPooxKxiBRiUtU1zvZRCvGyDLAGHn7nvZkM';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications.');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export async function subscribeToPush(userId) {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Save to database
    const { endpoint, keys } = subscription.toJSON();
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: endpoint,
        auth: keys.auth,
        p256dh: keys.p256dh
      }, { onConflict: 'user_id,endpoint' });

    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return false;
  }
}

export async function unsubscribeFromPush(userId) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      const { endpoint } = subscription.toJSON();
      await subscription.unsubscribe();
      
      // Remove from database
      await supabase
        .from('push_subscriptions')
        .delete()
        .match({ user_id: userId, endpoint: endpoint });
    }
    
    return true;
  } catch (error) {
    console.error('Unsubscribe failed:', error);
    return false;
  }
}

export async function checkNotificationSupport() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
