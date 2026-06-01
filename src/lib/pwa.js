import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = '3aaec25a-5a3d-4029-8a79-7b2b93c86788';

// OneSignal.init() must only ever run once per page load. We hold the init
// promise at module scope so that callers (e.g. subscribeToPush) can await
// completion before touching OneSignal.User.* — accessing those internals
// before init finishes throws the cryptic "OneSignal.Ye.Qe" error.
let initPromise = null;

export function initOneSignal(userId) {
  if (!initPromise) {
    initPromise = (async () => {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: '/' },
        serviceWorkerPath: 'OneSignalSDKWorker.js',
      });

      // Suppress system push notifications while the user is actively using the app.
      // Without this, every incoming message (and other events) fires an OS notification
      // even though the user is already looking at the chat — resulting in notification spam.
      // The message still arrives via realtime, so the in-app UI stays up to date.
      // Registered once, inside the init-only block, to avoid stacking duplicate listeners.
      OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
        // foregroundWillDisplay fires whenever the site is open, including in a background
        // tab. Only suppress when the tab is actually visible (user is looking at the app);
        // if it's hidden/minimized we still want the notification to show.
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          event.preventDefault();
        }
      });
    })().catch((error) => {
      // Reset so a later attempt can retry init instead of being stuck on a
      // rejected promise forever.
      initPromise = null;
      console.error('OneSignal Init Error:', error);
      throw error;
    });
  }

  return initPromise.then(async () => {
    if (userId) {
      await OneSignal.login(userId);
      console.log('OneSignal initialized and user logged in:', userId);
    }
  });
}

// Resolves once OneSignal.init() has completed. subscribeToPush uses this to
// guarantee the SDK is ready before touching OneSignal.User.PushSubscription.
function ensureInitialized(userId) {
  return initOneSignal(userId);
}

export async function checkNotificationSupport() {
  return true; // OneSignal handles checking support internally
}

export function isPushSubscribed() {
  try {
    return OneSignal.User.PushSubscription.optedIn || false;
  } catch {
    return false;
  }
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
    // Wait for OneSignal.init() to finish. Without this, on a cold PWA launch
    // the SDK internals (OneSignal.User.PushSubscription) may not exist yet and
    // optIn() throws "undefined is not an object (evaluating 'OneSignal.Ye.Qe')".
    await ensureInitialized(userId);

    // Trigger the native permission prompt from the user gesture. iOS PWAs only
    // surface the system dialog via requestPermission(); calling optIn() alone
    // is not enough there.
    if (OneSignal.Notifications.permission !== true) {
      await OneSignal.Notifications.requestPermission();
    }

    if (OneSignal.Notifications.permission !== true) {
      return { success: false, error: 'permission-denied' };
    }

    await OneSignal.User.PushSubscription.optIn();

    return { success: true };
  } catch (error) {
    console.error('OneSignal Subscribe error:', error);
    return { success: false, error: error?.message || String(error) };
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
