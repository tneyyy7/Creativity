const ONESIGNAL_APP_ID = '3aaec25a-5a3d-4029-8a79-7b2b93c86788';

let isInitialized = false;
// Set synchronously the moment the very first init callback starts running, so
// rapid repeat calls (React StrictMode double-mount, the [user] effect re-firing)
// don't each fire their own os.init() before isInitialized flips — that race is
// what produced the storm of "SDK already initialized" errors in the console.
let initStarted = false;
let oneSignalInstance = null;
let initPromiseResolve = null;
let initError = null;

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

// The current site language, used so push notifications are delivered in the
// language the user picked on the site (independent of the device language).
const getSiteLanguage = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem('app_lang') || 'en').slice(0, 2).toLowerCase();
    }
  } catch { /* ignore */ }
  return 'en';
};

// Tag the OneSignal subscription with a language so multilingual pushes resolve correctly.
const applyLanguage = async (os, lang) => {
  try {
    const code = String(lang || 'en').slice(0, 2).toLowerCase();
    if (os && os.User && typeof os.User.setLanguage === 'function') {
      await os.User.setLanguage(code);
      console.log('OneSignal language set:', code);
    }
  } catch (err) {
    console.error('OneSignal setLanguage error:', err);
  }
};

// Public helper: call whenever the user switches the site language.
export function setOneSignalLanguage(lang) {
  runOnOneSignal(async (os) => {
    await applyLanguage(os, lang);
  });
}

export async function initOneSignal(userId) {
  runOnOneSignal(async (os) => {
    if (isInitialized || initStarted) {
      // Init has already completed (isInitialized) or is in flight (initStarted).
      // Either way, never call os.init() again — just make sure the right user
      // is logged in. Skip login() until init has actually finished, otherwise
      // os.User isn't ready yet and login throws.
      if (isInitialized && userId && typeof os.login === 'function') {
        try {
          await os.login(userId);
          console.log('OneSignal user logged in (already initialized):', userId);
        } catch (err) {
          console.error('OneSignal login error:', err);
        }
      }
      if (isInitialized) {
        await applyLanguage(os, getSiteLanguage());
        if (initPromiseResolve) initPromiseResolve(os);
      }
      return;
    }

    initStarted = true;
    try {
      // Enable detailed trace logs to easily debug iOS/PWA issues in Safari Web Inspector
      if (os.Debug && typeof os.Debug.setLogLevel === 'function') {
        os.Debug.setLogLevel('trace');
      }

      // Initialize with standard parameters.
      // Removing serviceWorkerPath and serviceWorkerParam allows the SDK to automatically
      // register OneSignalSDKWorker.js at the root, bypassing strict iOS Safari security checks.
      await os.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
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

      await applyLanguage(os, getSiteLanguage());

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
      
      // If the SDK complains that it is already initialized, that is a success for us!
      const errorMsg = (error && error.message) ? error.message.toLowerCase() : '';
      if (errorMsg.includes('already initialized')) {
        isInitialized = true;
        if (initPromiseResolve) initPromiseResolve(os);
        return;
      }

      // Genuine failure — allow a later call (e.g. subscribeToPush) to retry init.
      initStarted = false;
      initError = error;
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
      throw new Error(initError ? initError.message : 'OneSignal SDK failed to initialize.');
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
