/**
 * Exécute `task` quand le main thread est idle — `requestIdleCallback` quand il existe,
 * fallback `setTimeout` court (Safari n'a toujours pas rIC). `timeoutMs` borne l'attente
 * rIC : sous charge continue, la tâche part quand même à l'échéance.
 */
export function runWhenIdle(task: () => void, timeoutMs = 2000): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => task(), { timeout: timeoutMs });
  } else {
    setTimeout(task, 300);
  }
}
