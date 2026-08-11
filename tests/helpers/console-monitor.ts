import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Console / page errors that may appear in extension E2E without indicating product bugs.
 * Document each pattern when adding new entries.
 */
export const ALLOWED_CONSOLE_PATTERNS: RegExp[] = [
  /Extension context invalidated/i,
  /Receiving end does not exist/i,
  /Failed to fetch/i,
  /network error/i,
  /ExtensionPay sync failed/i,
  /\[Quick Notes\] ExtensionPay/i,
  /Could not establish connection/i
];

export type ConsoleMonitor = {
  consoleErrors: string[];
  pageErrors: string[];
  unhandledRejections: string[];
};

export function attachConsoleMonitor(page: Page): ConsoleMonitor {
  const monitor: ConsoleMonitor = {
    consoleErrors: [],
    pageErrors: [],
    unhandledRejections: []
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      monitor.consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    monitor.pageErrors.push(err.message);
  });

  page.on('crash', () => {
    monitor.pageErrors.push('Page crashed');
  });

  // Uncaught errors in extension pages also surface as pageerror; catch rejections via init script.
  page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason);
      (window as unknown as { __qnUnhandledRejections?: string[] }).__qnUnhandledRejections ??=
        [];
      (window as unknown as { __qnUnhandledRejections: string[] }).__qnUnhandledRejections.push(
        message
      );
    });
  });

  return monitor;
}

export async function collectUnhandledRejections(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const list = (window as unknown as { __qnUnhandledRejections?: string[] })
      .__qnUnhandledRejections;
    return list ? [...list] : [];
  });
}

function filterCritical(messages: string[]): string[] {
  return messages.filter(
    (message) => !ALLOWED_CONSOLE_PATTERNS.some((pattern) => pattern.test(message))
  );
}

export async function assertNoCriticalErrors(
  monitor: ConsoleMonitor,
  page: Page,
  testTitle: string
): Promise<void> {
  const rejections = await collectUnhandledRejections(page);
  monitor.unhandledRejections.push(...rejections);

  const criticalConsole = filterCritical(monitor.consoleErrors);
  const criticalPage = filterCritical(monitor.pageErrors);
  const criticalRejections = filterCritical(monitor.unhandledRejections);

  const summary = [
    criticalPage.length ? `page errors: ${criticalPage.join('; ')}` : '',
    criticalConsole.length ? `console errors: ${criticalConsole.join('; ')}` : '',
    criticalRejections.length ? `unhandled rejections: ${criticalRejections.join('; ')}` : ''
  ]
    .filter(Boolean)
    .join(' | ');

  expect(criticalPage, `[${testTitle}] ${summary}`).toHaveLength(0);
  expect(criticalConsole, `[${testTitle}] ${summary}`).toHaveLength(0);
  expect(criticalRejections, `[${testTitle}] ${summary}`).toHaveLength(0);
}
