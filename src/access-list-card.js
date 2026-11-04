import { api } from './api.js';
import { escape } from './specimen-format.js';

const accessSettingsUrl = '/api/settings/access';

function markup(state, busy) {
  return `<article class="card settings-card"><h2>Email sign-in</h2>
    ${!state.emailSignIn ? '<p class="settings-note">Email sign-in only applies on the public host.</p>' : ''}
    <form id="access-list-form" class="settings-form">
      <fieldset class="app-settings-fields"${busy || state.saving ? ' disabled' : ''}>
        <ul class="access-list">
          ${state.owner ? `<li><span>${escape(state.owner)}<small class="settings-note">Owner · always allowed</small></span></li>` : ''}
          ${state.draft.map(email => `<li><span>${escape(email)}</span><button type="button" class="button secondary" data-access-remove="${escape(email)}" aria-label="${escape(`Remove ${email}`)}">Remove</button></li>`).join('')}
        </ul>
        <label for="access-email">Email address</label>
        <div class="access-list-add"><input id="access-email" type="email" autocomplete="email" required value="${escape(state.input)}">
          <button type="submit" class="button secondary">Add</button></div>
        <div class="settings-buttons"><button id="access-list-save" type="button" class="button primary">${state.saving ? 'Saving…' : 'Save'}</button>
          <button id="access-list-reset" type="button" class="button secondary">Reset</button></div>
      </fieldset>
      <p class="settings-error" role="alert">${escape(state.error)}</p>
      <p class="settings-note settings-save-status" role="status">${escape(state.saved)}</p>
    </form></article>`;
}

export function createAccessListCard({ update }) {
  const state = { emails: [], draft: [], owner: null, emailSignIn: false, input: '', saved: '', error: '', saving: false };
  const accept = result => {
    state.emails = result.emails; state.draft = [...result.emails];
    state.owner = result.owner; state.emailSignIn = result.emailSignIn; state.input = '';
  };
  const changed = () => { state.error = ''; state.saved = 'Unsaved changes · Save to apply'; update(); };
  async function save() {
    if (state.saving) return;
    state.saving = true; state.saved = ''; state.error = ''; update();
    try {
      accept(await api(accessSettingsUrl, { method: 'PUT', body: JSON.stringify({ emails: state.draft }) }));
      state.saved = 'Saved · removed addresses are signed out';
    } catch (error) { state.error = error.message; }
    finally { state.saving = false; update(); }
  }
  return {
    get saving() { return state.saving; },
    render: busy => markup(state, busy),
    async load() { accept(await api(accessSettingsUrl)); state.saved = ''; state.error = ''; },
    change(target) {
      if (target.id !== 'access-email') return false;
      state.input = target.value; return true;
    },
    add(event) {
      event.preventDefault();
      if (state.saving) return;
      const email = state.input.trim().toLowerCase();
      if (!email) return;
      if (email !== state.owner && !state.draft.includes(email)) state.draft = [...state.draft, email].sort();
      state.input = ''; changed();
    },
    click(target) {
      if (target.closest('#access-list-save')) { void save(); return true; }
      if (target.closest('#access-list-reset')) {
        state.draft = [...state.emails]; state.input = ''; state.error = ''; state.saved = ''; update(); return true;
      }
      const remove = target.closest('[data-access-remove]');
      if (!remove) return false;
      state.draft = state.draft.filter(email => email !== remove.dataset.accessRemove); changed(); return true;
    },
  };
}
