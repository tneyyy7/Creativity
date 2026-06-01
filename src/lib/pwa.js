const ONESIGNAL_APP_ID = '3aaec25a-5a3d-4029-8a79-7b2b93c86788';

let isInitialized = false;
let oneSignalInstance = null;
let initPromiseResolve = null;

const initPromise = new Promise((resolve) => {
  initPromiseResolve = resolve;
});

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

  const os = getOS();
  if (os) {
    callback(os);
    return;
  }

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
      if (initPromiseResolve) initPromiseResolve(os);
      return;
    }

    try {
      await os.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: '/' },
        serviceWorkerPath: '/OneSignalSDKWorker.js',
      });
      
      isInitialized = true;
      
      if (userId && typeof os.login === 'function') {
        try {
          await os.login(userId);
          console.log('OneSignal initialized and user logged in:', userId);
        } catch (loginErr) {
          console.error('OneSignal login error during init:', loginErr);
        }
      }

      if (os.Notifications && typeof os.Notifications.addEventListener === 'function') {
        os.Notifications.addEventListener('foregroundWillDisplay', (event) => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            event.preventDefault();
          }
        });
      }
      
      if (initPromiseResolve) initPromiseResolve(os);
    } catch (error) {
      console.error('OneSignal Init Error:', error);
      if (initPromiseResolve) initPromiseResolve(null);
    }
  });
}

export function checkNotificationSupport() {
  if (typeof window === 'undefined') return { supported: false, reason: 'ssr', message: 'SSR' };

  // Precise iOS detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  // Precise standalone PWA mode detection
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const hasNotification = 'Notification' in window;

  // On iOS Safari, W3C Web Push is ONLY supported in Standalone PWA mode (added to Home Screen)
  if (isIOS && !isStandalone) {
    return {
      supported: false,
      reason: 'ios_not_standalone',
      message: 'Push notifications on iOS require adding the app to the Home Screen.'
    };
  }

  const supported = hasServiceWorker && hasPushManager && hasNotification;
  return {
    supported,
    reason: supported ? 'supported' : 'browser_unsupported',
    message: supported ? 'Supported' : 'Your browser does not support push notifications.'
  };
}

export function isPushSubscribed() {
  try {
    const os = getOS();
    if (os && isInitialized && os.User && os.User.PushSubscription) {
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
  try {
    // If initialization hasn't started yet, trigger it
    if (!isInitialized && typeof window !== 'undefined') {
      initOneSignal(userId);
    }
    const os = await initPromise;
    if (!os) {
      throw new Error('OneSignal SDK failed to initialize.');
    }
    if (!os.User || !os.User.PushSubscription) {
      throw new Error('OneSignal User/PushSubscription namespace is not available.');
    }
    if (userId && typeof os.login === 'function') {
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
    const os = await initPromise;
    if (os && os.User && os.User.PushSubscription && typeof os.User.PushSubscription.optOut === 'function') {
      await os.User.PushSubscription.optOut();
      return true;
    }
    return false;
  } catch (error) {
    console.error('OneSignal Unsubscribe error:', error);
    return false;
  }
}

export async function testPushNotification(userId) {
  return { success: true, message: "Use OneSignal dashboard to send test alerts" };
}
