import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = '3aaec25a-5a3d-4029-8a79-7b2b93c86788';

let isInitialized = false;

// Helper to get the native global OneSignal object to bypass any outdated react-onesignal proxy wrapper limitations
const getOS = () => {
  if (typeof window !== 'undefined' && window.OneSignal) {
    return window.OneSignal;
  }
  return OneSignal;
};

export async function initOneSignal(userId) {
  if (isInitialized) {
    if (userId) {
      try {
        const os = getOS();
        await os.login(userId);
        console.log('OneSignal user logged in (already initialized):', userId);
      } catch (err) {
        console.error('OneSignal login error:', err);
      }
    }
    return;
  }

  try {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerParam: { scope: '/' },
      serviceWorkerPath: 'OneSignalSDKWorker.js',
    });
    
    isInitialized = true;
    
    const os = getOS();
    if (userId) {
      await os.login(userId);
      console.log('OneSignal initialized and user logged in:', userId);
    }

    // Suppress system push notifications while the user is actively using the app.
    os.Notifications.addEventListener('foregroundWillDisplay', (event) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        event.preventDefault();
      }
    });
  } catch (error) {
    console.error('OneSignal Init Error:', error);
  }
}

export async function checkNotificationSupport() {
  return true;
}

export function isPushSubscribed() {
  try {
    const os = getOS();
    return os.User.PushSubscription.optedIn || false;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission() {
  try {
    const os = getOS();
    await os.Slidedown.promptPush();
    return true;
  } catch (err) {
    console.error('Permission request failed:', err);
    return false;
  }
}

export async function subscribeToPush(userId) {
  try {
    const os = getOS();
    if (userId) {
      await os.login(userId);
    }
    await os.User.PushSubscription.optIn();
    
    return { success: true };
  } catch (error) {
    console.error('OneSignal Subscribe error:', error);
    return { success: false, error: error.message };
  }
}

export async function unsubscribeFromPush() {
  try {
    const os = getOS();
    await os.User.PushSubscription.optOut();
    return true;
  } catch (error) {
    console.error('OneSignal Unsubscribe error:', error);
    return false;
  }
}

export async function testPushNotification(userId) {
  return { success: true, message: "Use OneSignal dashboard to send test alerts" };
}
