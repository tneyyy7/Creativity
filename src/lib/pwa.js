import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = '3aaec25a-5a3d-4029-8a79-7b2b93c86788';

export async function initOneSignal(userId) {
  try {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerParam: { scope: '/' },
      serviceWorkerPath: 'OneSignalSDKWorker.js',
    });
    
    if (userId) {
      await OneSignal.login(userId);
      console.log('OneSignal initialized and user logged in:', userId);
    }
  } catch (error) {
    console.error('OneSignal Init Error:', error);
  }
}

export async function checkNotificationSupport() {
  return true; // OneSignal handles checking support internally
}

export async function requestNotificationPermission() {
  try {
    await OneSignal.Slidedown.promptPush();
    return true;
  } catch (err) {
    console.error('Permission request failed:', err);
    return false;
  }
}

export async function subscribeToPush(userId) {
  try {
    if (userId) {
      await OneSignal.login(userId);
    }
    await OneSignal.User.PushSubscription.optIn();
    
    return { success: true };
  } catch (error) {
    console.error('OneSignal Subscribe error:', error);
    return { success: false, error: error.message };
  }
}

export async function unsubscribeFromPush() {
  try {
    await OneSignal.User.PushSubscription.optOut();
    return true;
  } catch (error) {
    console.error('OneSignal Unsubscribe error:', error);
    return false;
  }
}

export async function testPushNotification(userId) {
  // OneSignal doesn't have a direct "test" function for a specific user from client SDK easily
  // Usually tests are done via Dashboard or API. 
  // We'll return success and tell the user to check dashboard or we can try to trigger via Supabase later if needed.
  return { success: true, message: "Use OneSignal dashboard to send test alerts" };
}
