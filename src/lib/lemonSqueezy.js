/**
 * Lemon Squeezy Integration Helper
 * Handles dynamic script loading, overlay checkout, and payment events
 */

let isScriptLoading = false;

/**
 * Dynamically loads the Lemon Squeezy JS library if not already loaded.
 * @returns {Promise<void>}
 */
export const loadLemonSqueezy = () => {
  return new Promise((resolve, reject) => {
    if (window.LemonSqueezy) {
      resolve();
      return;
    }

    if (isScriptLoading) {
      const interval = setInterval(() => {
        if (window.LemonSqueezy) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      return;
    }

    isScriptLoading = true;
    const script = document.createElement('script');
    script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      isScriptLoading = false;
      // Initialize Lemon Squeezy overlay window object
      if (typeof window.createLemonSqueezy === 'function') {
        window.createLemonSqueezy();
      }
      resolve();
    };

    script.onerror = (err) => {
      isScriptLoading = false;
      reject(new Error('Failed to load Lemon Squeezy script'));
    };

    document.head.appendChild(script);
  });
};

/**
 * Programmatically opens the Lemon Squeezy overlay checkout.
 * @param {string} checkoutUrl - The base checkout URL from Lemon Squeezy dashboard.
 * @param {string} userId - The current user's Supabase UID to pass as custom metadata.
 * @param {Object} options - Additional checkout custom parameters.
 */
export const openCheckout = async (checkoutUrl, userId, options = {}) => {
  try {
    await loadLemonSqueezy();

    if (!window.LemonSqueezy) {
      throw new Error('Lemon Squeezy overlay not initialized');
    }

    // Append current user ID to custom checkout parameter so the webhook can match it
    const url = new URL(checkoutUrl);
    url.searchParams.set('checkout[custom][user_id]', userId);
    
    // Add any additional options if provided
    Object.entries(options).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    // Open via Lemon Squeezy Overlay
    window.LemonSqueezy.Url.Open(url.toString());
  } catch (error) {
    console.error('Error opening Lemon Squeezy checkout:', error);
    // Fallback: open in a new window if script failed
    const url = new URL(checkoutUrl);
    url.searchParams.set('checkout[custom][user_id]', userId);
    window.open(url.toString(), '_blank');
  }
};

/**
 * Registers global event handlers for Lemon Squeezy payment events (e.g. checkout success)
 * @param {Function} onCheckoutSuccess - Callback triggered when checkout completes successfully.
 */
export const setupLemonSqueezyCallbacks = async (onCheckoutSuccess) => {
  try {
    await loadLemonSqueezy();
    
    if (window.LemonSqueezy) {
      window.LemonSqueezy.Setup.eventHandler = (event) => {
        // Event types include: 'Checkout.Success', 'Checkout.Close', etc.
        if (event.event === 'Checkout.Success') {
          console.log('Lemon Squeezy payment completed successfully!', event);
          if (typeof onCheckoutSuccess === 'function') {
            onCheckoutSuccess(event.data);
          }
        }
      };
    }
  } catch (error) {
    console.error('Failed to setup Lemon Squeezy callbacks:', error);
  }
};
