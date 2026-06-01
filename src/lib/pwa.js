const ONESIGNAL_APP_ID = '3aaec25a-5a3d-4029-8a79-7b2b93c86788';

let isInitialized = false;
let oneSignalInstance = null;

// Safe accessor for window.OneSignal
const getOS = () => {
  if (oneSignalInstance) return oneSignalInstance;
  if (typeof window !== 'undefined' && window.OneSignal && !Array.isArray(window.OneSignal)) {
    return window.OneSignal;
  }
  return null;
};

// Helper to push actions to OneSignalDeferred safely
const runOnOneSignal = (callback) => {
  if (typeof window === 'undefined') return;

  // If already initialized and we have the instance, run immediately
  const os = getOS();
  if (os) {
    callback(os);
    return;
  }

  // Otherwise, queue it in OneSignalDeferred (the official v16 command queue)
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (instance) => {
    oneSignalInstance = instance;
    await callback(instance);
  });
};

export async function initOneSignal(userId) {
  runOnOneSignal(async (os) => {
    if (isInitialized) {
      if (userId && typeof os.login === 'function') {
        try {
          await os.login(userId);
          console.log('OneSignal user logged in (already initialized):', userId);
        } catch (err) {
          console.error('OneSignal login error:', err);
        }
      }
      return;
    }

    try {
      await os.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: '/' },
        serviceWorkerPath: 'OneSignalSDKWorker.js',
      });
      
      isInitialized = true;
      
      if (userId && typeof os.login === 'function') {
        await os.login(userId);
        console.log('OneSignal initialized and user logged in:', userId);
      }

      if (os.Notifications && typeof os.Notifications.addEventListener === 'function') {
        os.Notifications.addEventListener('foregroundWillDisplay', (event) => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            event.preventDefault();
          }
        });
      }
    } catch (error) {
      console.error('OneSignal Init Error:', error);
    }
  });
}

export async function checkNotificationSupport() {
  return true;
}

export function isPushSubscribed() {
  try {
    const os = getOS();
    if (os && os.User && os.User.PushSubscription) {
      return os.User.PushSubscription.optedIn || false;
    }
    return false;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission() {
  return new Promise((resolve) => {
    runOnOneSignal(async (os) => {
      try {
        if (os && os.Slidedown && typeof os.Slidedown.promptPush === 'function') {
          await os.Slidedown.promptPush();
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (err) {
        console.error('Permission request failed:', err);
        resolve(false);
      }
    });
  });
}

export async function subscribeToPush(userId) {
  return new Promise((resolve) => {
    runOnOneSignal(async (os) => {
      try {
        if (!os || !os.User || !os.User.PushSubscription) {
          throw new Error('OneSignal SDK is not fully loaded or initialized yet.');
        }
        if (userId && typeof os.login === 'function') {
          await os.login(userId);
        }
        await os.User.PushSubscription.optIn();
        resolve({ success: true });
      } catch (error) {
        console.error('OneSignal Subscribe error:', error);
        resolve({ success: false, error: error.message });
      }
    });
  });
}

export async function unsubscribeFromPush() {
  return new Promise((resolve) => {
    runOnOneSignal(async (os) => {
      try {
        if (os && os.User && os.User.PushSubscription && typeof os.User.PushSubscription.optOut === 'function') {
          await os.User.PushSubscription.optOut();
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (error) {
        console.error('OneSignal Unsubscribe error:', error);
        resolve(false);
      }
    });
  });
}

export async function testPushNotification(userId) {
  return { success: true, message: "Use OneSignal dashboard to send test alerts" };
}


