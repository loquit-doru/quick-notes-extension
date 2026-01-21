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

// Initialize ExtPay
const extpay = typeof ExtPay !== 'undefined' ? ExtPay('quick-notes-new') : null;

// Check if user is Pro (paid)
async function isPro() {

  try {
    // Check ExtensionPay first
    if (extpay) {
      const user = await extpay.getUser();
      if (user.paid === true) return true;
    }

    // Check local storage for crypto payment
    const { proUnlocked } = await chrome.storage.sync.get(['proUnlocked']);
    return proUnlocked === true;
  } catch (err) {
    console.error('Pro check failed:', err);
    const { proUnlocked } = await chrome.storage.sync.get(['proUnlocked']);
    return proUnlocked === true;
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
    await chrome.storage.sync.set({
      proUnlocked: true,
      cryptoTxHash: txHash,
      cryptoPaidAt: new Date().toISOString(),
      paymentMethod: 'crypto-base'
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
  extpay.onPaid.addListener(user => {
    console.log('User paid via card!', user);
    chrome.storage.sync.set({
      proUnlocked: true,
      proPaidAt: new Date().toISOString(),
      paymentMethod: 'card-stripe'
    });
  });
}

// Export for use in popup.js
window.QuickNotesPro = {
  isPro,
  openPaymentPage,
  verifyCryptoPayment,
  copyToClipboard,
  CRYPTO_CONFIG,
  extpay,
};

// DEV: Reset Pro status for testing
async function resetProStatus() {
  await chrome.storage.sync.remove(['proUnlocked', 'cryptoTxHash', 'cryptoPaidAt', 'proPaidAt', 'paymentMethod']);
  console.log('🔄 Pro status reset! Reload extension.');
  return true;
}

// Export reset function
window.QuickNotesPro.resetProStatus = resetProStatus;




