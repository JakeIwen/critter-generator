import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { portraitVersionOf, cadIsStale, PORTRAIT_KINDS } from '../shared/specimen-assets.mjs';
import { REVIEW_STATUS, REVIEW_FINDINGS } from '../shared/review-status.mjs';
import { escape, hasPrintModel } from './specimen-format.js';
import { icon } from './icons.js';

export function portraitVersionsFor(specimen) {
  if (!specimen.image) return [];
  const current = portraitVersionOf(specimen);
  const versions = new Map((specimen.portraits ?? []).map(portrait => [portrait.version, portrait]));
  if (!versions.has(current)) versions.set(current, { version: current });
  return [...versions.values()].sort((a, b) => b.version - a.version).map(portrait => ({ ...portrait, current: portrait.version === current,
    url: `/api/specimens/${encodeURIComponent(specimen.id)}/portraits/${portrait.version}.png?download=1` }));
}

function portraitControls(specimen) {
  if (!specimen.image) return '';
  const versions = portraitVersionsFor(specimen);
  return `<section class="portrait-controls card" aria-label="Portrait versions and edits"><div class="action-heading"><h3>Portrait <span class="version-label">v${portraitVersionOf(specimen)}</span></h3><button id="regenerate-portrait" class="button secondary" title="Create another portrait of this species. Existing CAD will be marked out of date." data-specimen-action>${icon('sparkle',14)} Another portrait</button></div>
    <details><summary>Edit this portrait</summary><form id="portrait-edit-form" class="portrait-edit-form"><label for="portrait-edit">What should change?</label><textarea id="portrait-edit" rows="3" maxlength="1000" required placeholder="Change only the fur to rust-orange. Keep the pose, markings and surroundings." data-specimen-action></textarea><button class="button primary" type="submit" data-specimen-action>Apply edit</button></form></details>
    <details class="portrait-history"><summary>Saved portraits (${versions.length})</summary><ul>${versions.map(portrait => `<li><a href="${portrait.url}" download>${icon('download',14)} Portrait v${portrait.version}${portrait.current ? ' · current' : ''}</a>${portrait.jobId ? `<a class="portrait-trace" href="/api/jobs/${encodeURIComponent(portrait.jobId)}/trace?download=1" download>Trace</a>` : ''}${portrait.kind === PORTRAIT_KINDS.EDIT && portrait.instructions ? `<span>${escape(portrait.instructions)}</span>` : ''}</li>`).join('')}</ul></details>
  </section>`;
}

function cadControls(specimen) {
  if (!specimen.image) return '';
  const available = hasPrintModel(specimen), stale = available && cadIsStale(specimen);
  const height = specimen.print?.height ?? specimen.settings?.height ?? PRINT_HEIGHT.initial;
  const baseplate = specimen.print?.baseplate ?? specimen.settings?.baseplate ?? true;
  const state = stale ? 'Out of date' : available ? 'Matches portrait' : 'Not generated';
  return `<section class="cad-controls card" aria-label="Generate printable CAD"><div class="action-heading"><h3>3D print / CAD <span class="info-hint" tabindex="0" title="Create a simplified printable interpretation of this portrait. Fine membranes, wings, fins and other structures may be approximated.">?</span></h3><span class="cad-status${stale ? ' stale' : ''}">${state}</span></div>
    ${stale ? `<p class="cad-stale-note">Existing files use portrait v${escape(specimen.print.sourcePortraitVersion ?? 1)}. The current portrait is v${portraitVersionOf(specimen)}.</p>` : ''}
    ${specimen.cadError ? `<p class="inline-error">CAD incomplete: ${escape(specimen.cadError)}</p>` : ''}
    ${specimen.print?.approximationNotes?.length ? `<details><summary>CAD approximations</summary><ul>${specimen.print.approximationNotes.map(note => `<li>${escape(note)}</li>`).join('')}</ul></details>` : ''}
    <form id="cad-form"><div class="height-control"><label for="cad-height">Print height</label><div><input id="cad-height" type="number" value="${escape(height)}" min="${PRINT_HEIGHT.min}" max="${PRINT_HEIGHT.max}" step="1" required data-specimen-action/><span>mm</span></div></div><label class="baseplate-control" for="cad-baseplate"><input id="cad-baseplate" type="checkbox"${baseplate ? ' checked' : ''} data-specimen-action/> Include baseplate</label><button id="generate-cad" class="button ${stale ? 'primary' : 'secondary'}" type="submit" data-specimen-action>${icon('cube',14)} ${available ? 'Regenerate CAD' : 'Generate CAD'}</button></form>
  </section>`;
}

export function renderSpecimenActions(byId, specimen, { busy, onPortrait, onCad }) {
  byId('specimen-actions').innerHTML = portraitControls(specimen) + cadControls(specimen);
  byId('specimen-actions').classList.toggle('hidden', !specimen.image);
  if (byId('regenerate-portrait')) byId('regenerate-portrait').onclick = () => onPortrait(specimen, {});
  if (byId('portrait-edit-form')) byId('portrait-edit-form').onsubmit = event => {
    event.preventDefault(); const instructions = byId('portrait-edit').value.trim();
    if (instructions) onPortrait(specimen, { instructions });
  };
  if (byId('cad-form')) byId('cad-form').onsubmit = event => {
    event.preventDefault();
    onCad(specimen, { height: Number(byId('cad-height').value), baseplate: byId('cad-baseplate').checked });
  };
  setSpecimenActionsBusy(byId, busy);
}

export function setSpecimenActionsBusy(byId, busy) {
  byId('specimen-actions').querySelectorAll('[data-specimen-action]').forEach(node => { node.disabled = busy; });
}

export function renderImageReview(review) {
  if (!review) return '';
  if (review.status === REVIEW_STATUS.UNAVAILABLE) return '<details class="image-review"><summary>Portrait review unavailable</summary><p>The portrait was saved. Its requirements have not been checked.</p></details>';
  const issues = [...(review.designIssues ?? []), ...(review.issues ?? [])];
  const flagged = issues.filter(issue => issue.status !== REVIEW_FINDINGS.SATISFIED);
  return `<details class="image-review"><summary>Advisory review · ${flagged.length ? `${flagged.length} item${flagged.length === 1 ? '' : 's'} to inspect` : 'no concerns reported'}</summary><p>A review can miss details. Inspect the portrait before relying on exact anatomy.</p><ul>${issues.map(issue => `<li><strong>${escape(issue.requirement)}</strong><span class="review-${escape(issue.status)}">${escape(issue.status)}</span><p>${escape(issue.observation)}</p></li>`).join('')}</ul></details>`;
}
