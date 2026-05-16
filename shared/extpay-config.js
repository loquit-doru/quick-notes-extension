// Single source for ExtensionPay slug (popup + service worker).
// Dashboard: https://extensionpay.com → extension → Settings (slug in URL).
(function (global) {
  global.QUICK_NOTES_EXTPAY = Object.freeze({
    EXTENSION_ID: 'quick-notes-new',
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
