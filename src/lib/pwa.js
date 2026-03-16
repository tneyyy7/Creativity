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
    console.log('Starting push subscription for user:', userId);
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    console.log('Current browser subscription:', subscription ? 'exists' : 'none');
    
    if (!subscription) {
      console.log('Subscribing to push manager...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      console.log('Push manager subscription successful');
    }

    // Save to database
    const subscriptionData = subscription.toJSON();
    console.log('Saving subscription to Supabase...');
    
    // Explicitly check for keys
    if (!subscriptionData.keys || !subscriptionData.keys.auth || !subscriptionData.keys.p256dh) {
      throw new Error('Push keys are missing from subscription object');
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subscriptionData.endpoint,
        auth: subscriptionData.keys.auth,
        p256dh: subscriptionData.keys.p256dh,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,endpoint' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('Subscription successfully saved to database');
    return { success: true };
  } catch (error) {
    console.error('Push subscription failed full error:', error);
    return { success: false, error: error.message || 'Unknown subscription error' };
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

export async function testPushNotification(userId) {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { test_user_id: userId }
    });

    if (error) {
      console.error('Invoke returned error:', error);
      // Try to get status code if available
      const statusInfo = error.context?.status ? ` (Status: ${error.context.status})` : '';
      let message = error.message + statusInfo;
      
      try {
        // Try to see if there's a body in the error context
        const errorBody = await error.context?.text();
        if (errorBody) message += `\nResponse: ${errorBody.substring(0, 100)}`;
      } catch (e) {}

      throw new Error(message);
    }
    
    // Check if the body contains an error even with 200 OK (our diagnostic mode)
    if (data && data.error) {
      const details = data.details ? `\nDetails: ${JSON.stringify(data.details)}` : '';
      throw new Error(`${data.error}${details}`);
    }
    
    if (data && data.message) {
      throw new Error(data.message);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Test push caught exception:', error);
    // If it's a weird object, stringify it
    const finalMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
    return { success: false, error: finalMsg };
  }
}
