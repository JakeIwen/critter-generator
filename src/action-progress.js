import { escape } from './specimen-format.js';

export function actionProgressMarkup(id, label) {
  return `<div id="${id}-progress" class="action-progress hidden"><p id="${id}-message" role="status" aria-live="polite"></p><progress aria-label="${escape(label)}"></progress><div class="action-progress-footer"><span>Elapsed <span id="${id}-elapsed">0:00</span></span><button id="${id}-cancel" class="button secondary" type="button">Cancel</button></div></div>`;
}

export function createActionProgress(byId, { id, buttonId, loadingLabel, onCancel, now = Date.now, schedule = setInterval, cancel = clearInterval }) {
  let timer = null, startedAt = null, button = null, idleLabel = '';
  const renderElapsed = () => {
    const seconds = Math.max(0, Math.floor((now() - startedAt) / 1000));
    if (byId(`${id}-elapsed`)) byId(`${id}-elapsed`).textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  return {
    update(job, title, { buttonId: activeButtonId = buttonId, loadingLabel: activeLabel = loadingLabel } = {}) {
      const region = byId(`${id}-progress`), submit = byId(activeButtonId);
      if (submit !== button) {
        if (button) button.innerHTML = idleLabel;
        button = submit; idleLabel = submit?.innerHTML ?? '';
      }
      region?.classList.toggle('hidden', !job);
      if (!job || !region) {
        if (timer !== null) cancel(timer);
        timer = null; startedAt = null;
        if (submit) submit.innerHTML = idleLabel;
        return;
      }
      const serverStart = Date.parse(job.createdAt);
      startedAt = Number.isFinite(serverStart) ? serverStart : startedAt ?? now();
      if (submit) { submit.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escape(activeLabel)}`; submit.disabled = true; }
      byId(`${id}-message`).textContent = job.cancelling ? 'Cancelling…' : job.message || title;
      byId(`${id}-cancel`).disabled = !job.id || Boolean(job.cancelling);
      byId(`${id}-cancel`).onclick = onCancel;
      renderElapsed();
      if (timer === null) timer = schedule(renderElapsed, 1000);
    },
  };
}
