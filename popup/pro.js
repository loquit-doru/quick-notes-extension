// Quick Notes Pro - Payment System with ExtensionPay + Crypto (Base)
// Card via ExtensionPay, Crypto via Base Network

// Crypto payment config
const CRYPTO_CONFIG = {
  network: 'base',
  chainId: 8453,
  receiverAddress: '0x607Fc9D41858Aa23065275043698a9262F8f9bf9',
  priceETH: 0.001, // ~$2.99
  priceUSDC: 3,
  usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  baseRPC: 'https://mainnet.base.org',
};

// License API (crypto + email restore)
const PRO_API = 'https://quick-notes-pro.apiworkersdev.workers.dev';

// Slug from shared/extpay-config.js (loaded before this script in popup + service worker).
const EXTPAY_EXTENSION_ID =
  (typeof QUICK_NOTES_EXTPAY !== 'undefined' && QUICK_NOTES_EXTPAY.EXTENSION_ID) ||
  'quick-notes-new';

// Initialize ExtPay
const extpay =
  typeof ExtPay !== 'undefined' ? ExtPay(EXTPAY_EXTENSION_ID) : null;

const EXTPAY_MISMATCH_HINT =
  'If ExtensionPay says your email is not on file, your Stripe payment may be linked to a different Quick Notes product in ExtensionPay. Contact support with your Stripe receipt (date + last 4 digits).';

async function getExtensionId() {
  let { extensionId } = await chrome.storage.local.get(['extensionId']);
  if (!extensionId) {
    extensionId = 'qn_' + crypto.randomUUID();
    await chrome.storage.local.set({ extensionId });
  }
  return extensionId;
}

async function readProUnlocked() {
  const { proUnlocked: localPro } = await chrome.storage.local.get(['proUnlocked']);
  if (localPro === true) return true;

  const { proUnlocked: syncPro } = await chrome.storage.sync.get(['proUnlocked']);
  if (syncPro === true) {
    await chrome.storage.local.set({ proUnlocked: true });
    return true;
  }
  return false;
}

async function setProUnlocked(extra = {}) {
  await chrome.storage.local.set({ proUnlocked: true, ...extra });
  try {
    await chrome.storage.sync.set({ proUnlocked: true });
  } catch (err) {
    console.warn('Could not sync Pro flag:', err);
  }
}

async function savePayerEmail(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) return;
  await chrome.storage.local.set({
    payerEmail: trimmed.toLowerCase(),
    proEmail: trimmed,
  });
}

function isExtPayUserPaid(user) {
  return !!(user && (user.paid === true || user.paidAt));
}

function emailsMatch(a, b) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function unlockFromExtPayUser(user, emailHint) {
  const email = user?.email || emailHint;
  await setProUnlocked({
    proPaidAt: new Date().toISOString(),
    paymentMethod: 'card-stripe',
    proEmail: email || undefined,
  });
  if (email) await savePayerEmail(email);
}

async function pollExtPayPaid(maxMs = 90000) {
  if (!extpay) return null;
  const intervalMs = 2000;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const user = await extpay.getUser();
    if (isExtPayUserPaid(user)) return user;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return extpay.getUser();
}

/** Card/Stripe restore via ExtensionPay (same Chrome profile or login link). */
async function restoreExtensionPay({ email, openLogin = false } = {}) {
  if (!extpay) {
    return {
      success: false,
      method: 'extpay',
      error: 'ExtensionPay is not available in this build.',
    };
  }

  const trimmedEmail = (email || '').trim();

  try {
    let user = await extpay.getUser();

    if (isExtPayUserPaid(user)) {
      if (trimmedEmail && user.email && !emailsMatch(user.email, trimmedEmail)) {
        return {
          success: false,
          method: 'extpay',
          needsLogin: true,
          error:
            'This Chrome profile is linked to a different email. Click "Restore with ExtensionPay" and sign in with your card payment email.',
        };
      }
      await unlockFromExtPayUser(user, trimmedEmail);
      return { success: true, method: 'extpay', email: user.email || trimmedEmail };
    }

    if (openLogin) {
      await extpay.openLoginPage();
      user = await pollExtPayPaid();
      if (isExtPayUserPaid(user)) {
        if (trimmedEmail && user.email && !emailsMatch(user.email, trimmedEmail)) {
          return {
            success: false,
            method: 'extpay',
            error:
              'Signed in, but the email does not match. Use the same email as your Stripe receipt.',
          };
        }
        await unlockFromExtPayUser(user, trimmedEmail);
        return { success: true, method: 'extpay', email: user.email || trimmedEmail };
      }
      return {
        success: false,
        method: 'extpay',
        needsLogin: true,
        error: `No active card purchase found for extension "${EXTPAY_EXTENSION_ID}". Sign in with the email from your Stripe receipt. ${EXTPAY_MISMATCH_HINT}`,
      };
    }

    if (trimmedEmail) {
      return {
        success: false,
        method: 'extpay',
        needsLogin: true,
        error:
          'Card payments restore via ExtensionPay on this Chrome profile — not by email alone. Use "Restore with ExtensionPay" above.',
      };
    }

    return {
      success: false,
      method: 'extpay',
      needsLogin: true,
      error: 'No card purchase on this profile. Use "Restore with ExtensionPay" to sign in.',
    };
  } catch (err) {
    console.error('ExtensionPay restore failed:', err);
    return {
      success: false,
      method: 'extpay',
      error: 'Could not reach ExtensionPay. Check your connection and try again.',
    };
  }
}

/** Card/Stripe restore via workers API (/activate-stripe). Email must match Stripe customer. */
async function restoreStripeByEmail(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return { success: false, method: 'stripe', error: 'Please enter your email' };
  }

  const extensionId = await getExtensionId();
  try {
    const response = await fetch(`${PRO_API}/activate-stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionId, email: trimmed }),
    });
    const result = await response.json();

    if (result.success) {
      await savePayerEmail(trimmed);
      await setProUnlocked({
        proEmail: trimmed,
        paymentMethod: 'card-stripe-restore',
        proPaidAt: new Date().toISOString(),
      });
      return {
        success: true,
        method: 'stripe',
        devicesUsed: result.devicesUsed,
        maxDevices: result.maxDevices,
      };
    }
    const rateLimited =
      result.code === 'rate_limited' ||
      /too many restore attempts/i.test(result.error || '');
    return {
      success: false,
      method: 'stripe',
      rateLimited,
      error:
        result.error ||
        'No Stripe purchase found for this email. Use the email on your Stripe receipt.',
    };
  } catch (err) {
    console.error('Stripe restore failed:', err);
    return {
      success: false,
      method: 'stripe',
      error: 'Could not reach the license server. Try again or use ExtensionPay restore.',
    };
  }
}

/** Crypto license restore via workers API (/activate). */
async function restoreLicenseByEmail(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return { success: false, error: 'Please enter your email' };
  }

  const extensionId = await getExtensionId();
  const response = await fetch(`${PRO_API}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extensionId, email: trimmed })
  });
  const result = await response.json();

  if (result.success) {
    await setProUnlocked({ proEmail: trimmed, paymentMethod: 'crypto-restore' });
    return { success: true, method: 'crypto', ...result };
  }
  return {
    success: false,
    method: 'crypto',
    error: result.error || 'No crypto license found for this email',
  };
}

/** Await on every popup open before paywall / trial limits. */
async function checkExtensionPayPro() {
  if (await readProUnlocked()) {
    return { unlocked: true, source: 'storage' };
  }
  if (!extpay) {
    return { unlocked: false, source: 'unavailable' };
  }
  try {
    const user = await extpay.getUser();
    if (isExtPayUserPaid(user)) {
      await unlockFromExtPayUser(user);
      return { unlocked: true, source: 'extpay', email: user.email || null };
    }
  } catch (err) {
    console.warn('ExtensionPay check failed:', err);
    if (await readProUnlocked()) {
      return { unlocked: true, source: 'storage' };
    }
  }
  return { unlocked: false, source: 'extpay' };
}

/** Server license for this extensionId (crypto or stripe-bound). */
async function checkServerProStatus() {
  const extensionId = await getExtensionId();
  try {
    const response = await fetch(
      `${PRO_API}/check?id=${encodeURIComponent(extensionId)}`
    );
    const data = await response.json();
    if (data.isPro) {
      await setProUnlocked({ paymentMethod: 'server-check' });
      return true;
    }
  } catch (err) {
    console.warn('Server Pro check failed:', err);
  }
  return false;
}

/** Fire-and-forget: link email + extensionId on server after card payment. */
async function registerStripeLicense(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) return;
  const extensionId = await getExtensionId();
  fetch(`${PRO_API}/register-stripe-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extensionId, email: trimmed }),
  }).catch((err) => console.warn('register-stripe-license failed:', err));
}

/** Silent restore using stored payer email (no UI). */
async function trySilentStripeRestore() {
  const { payerEmail, proEmail } = await chrome.storage.local.get([
    'payerEmail',
    'proEmail',
  ]);
  const email = payerEmail || proEmail;
  if (!email) return false;
  const result = await restoreStripeByEmail(email);
  return result.success;
}

/**
 * Unified restore: ExtensionPay → server /check → Stripe email (input or stored).
 */
async function restorePurchase({ email, openLogin = false } = {}) {
  const ext = await checkExtensionPayPro();
  if (ext.unlocked) {
    return { success: true, method: 'extpay', email: ext.email };
  }
  if (await checkServerProStatus()) {
    return { success: true, method: 'server' };
  }

  const stored = await chrome.storage.local.get(['payerEmail', 'proEmail']);
  const tryEmail =
    (email || '').trim() || stored.payerEmail || stored.proEmail || '';

  if (tryEmail) {
    const stripeResult = await restoreStripeByEmail(tryEmail);
    if (stripeResult.success) return stripeResult;
    if (stripeResult.rateLimited) {
      return {
        success: false,
        method: 'stripe',
        rateLimited: true,
        error: stripeResult.error,
      };
    }

    const extResult = await restoreExtensionPay({
      email: tryEmail,
      openLogin,
    });
    if (extResult.success) return extResult;

    return {
      success: false,
      method: 'restore',
      error: stripeResult.error || extResult.error || 'Could not restore purchase',
      needsLogin: extResult.needsLogin,
    };
  }

  if (openLogin) {
    return restoreExtensionPay({ openLogin: true });
  }

  return {
    success: false,
    method: 'restore',
    needsLogin: true,
    error:
      'Enter the email from your Stripe receipt, or use ExtensionPay on this Chrome profile.',
  };
}

// Check if user is Pro (paid)
async function isPro() {
  try {
    const ext = await checkExtensionPayPro();
    if (ext.unlocked) return true;
    return false;
  } catch (err) {
    console.error('Pro check failed:', err);
    return readProUnlocked();
  }
}

// Open card payment page (ExtensionPay)
function openPaymentPage() {
  if (extpay) {
    extpay.openPaymentPage();
  } else {
    window.open('https://extensionpay.com', '_blank');
  }
}

// Verify crypto transaction on Base via RPC
async function verifyCryptoPayment(txHash) {
  try {
    // Clean the hash
    txHash = txHash.trim();
    if (!txHash.startsWith('0x')) txHash = '0x' + txHash;

    // Verify format
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return { success: false, error: 'Invalid transaction hash format' };
    }

    // Get transaction via Base RPC
    const txResponse = await fetch(CRYPTO_CONFIG.baseRPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1
      })
    });
    const txData = await txResponse.json();
    const tx = txData.result;

    if (!tx) {
      return { success: false, error: 'Transaction not found' };
    }

    // Get receipt to verify success
    const receiptResponse = await fetch(CRYPTO_CONFIG.baseRPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 2
      })
    });
    const receiptData = await receiptResponse.json();
    const receipt = receiptData.result;

    if (!receipt || receipt.status !== '0x1') {
      return { success: false, error: 'Transaction failed or pending' };
    }

    // Verify recipient
    const toAddress = tx.to?.toLowerCase();
    const receiverLower = CRYPTO_CONFIG.receiverAddress.toLowerCase();
    const usdcLower = CRYPTO_CONFIG.usdcContract.toLowerCase();

    const isETHTransfer = toAddress === receiverLower;
    const isUSDCTransfer = toAddress === usdcLower;

    if (!isETHTransfer && !isUSDCTransfer) {
      return { success: false, error: 'Transaction not sent to correct address' };
    }

    // For USDC transfer, verify the input data contains our address
    if (isUSDCTransfer) {
      const inputData = tx.input?.toLowerCase() || '';
      const receiverInInput = inputData.includes(receiverLower.slice(2));
      if (!receiverInInput) {
        return { success: false, error: 'USDC not sent to correct address' };
      }

      if (inputData.length >= 138) {
        const amountHex = '0x' + inputData.slice(-64);
        const amountUSDC = parseInt(amountHex, 16) / 1e6;
        if (amountUSDC < CRYPTO_CONFIG.priceUSDC * 0.95) {
          return { success: false, error: `Insufficient USDC amount` };
        }
      }
    }

    // Verify amount for ETH
    if (isETHTransfer) {
      const valueWei = BigInt(tx.value);
      const minWei = BigInt(Math.floor(CRYPTO_CONFIG.priceETH * 0.95 * 1e18));
      if (valueWei < minWei) {
        return { success: false, error: 'Insufficient ETH amount sent' };
      }
    }

    // Payment verified! Store it
    await setProUnlocked({
      cryptoTxHash: txHash,
      cryptoPaidAt: new Date().toISOString(),
      paymentMethod: 'crypto-base',
    });

    return { success: true, txHash };
  } catch (err) {
    console.error('Crypto verification error:', err);
    return { success: false, error: 'Verification failed. Please try again.' };
  }
}

// Copy to clipboard helper
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Copy failed:', err);
    return false;
  }
}

// Listen for successful payment (ExtensionPay)
if (extpay) {
  extpay.onPaid.addListener(async (paidUser) => {
    console.log('User paid via card!', paidUser);
    let user = paidUser;
    if (!isExtPayUserPaid(user)) {
      try {
        user = await extpay.getUser();
      } catch (err) {
        console.warn('ExtensionPay getUser after onPaid failed:', err);
      }
    }
    await unlockFromExtPayUser(user || {});
    if (user?.email) registerStripeLicense(user.email);
  });
}

/** DEV ONLY — unlock Pro locally without payment. Do not ship to production users. */
async function grantProLocally() {
  await setProUnlocked({
    proPaidAt: new Date().toISOString(),
    paymentMethod: 'dev-local',
  });
  console.warn('[Quick Notes] grantProLocally() — dev unlock only');
  return { success: true, method: 'dev-local' };
}

// Export for use in popup.js
window.QuickNotesPro = {
  isPro,
  checkExtensionPayPro,
  checkServerProStatus,
  openPaymentPage,
  verifyCryptoPayment,
  restoreExtensionPay,
  restoreStripeByEmail,
  restoreLicenseByEmail,
  restorePurchase,
  trySilentStripeRestore,
  registerStripeLicense,
  savePayerEmail,
  grantProLocally,
  getExtensionId,
  setProUnlocked,
  copyToClipboard,
  CRYPTO_CONFIG,
  extpay,
  EXTPAY_EXTENSION_ID,
  PRO_API,
};

// DEV: Reset Pro status for testing
async function resetProStatus() {
  const keys = [
    'proUnlocked',
    'cryptoTxHash',
    'cryptoPaidAt',
    'proPaidAt',
    'paymentMethod',
    'payerEmail',
    'proEmail',
  ];
  await chrome.storage.local.remove(keys);
  await chrome.storage.sync.remove(keys);
  console.log('🔄 Pro status reset! Reload extension.');
  return true;
}

// Export reset function
window.QuickNotesPro.resetProStatus = resetProStatus;




