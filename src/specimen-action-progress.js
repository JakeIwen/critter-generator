import { JOB_KINDS } from '../shared/generation-timing.mjs';
import { createActionProgress } from './action-progress.js';

const paintingLabel = 'Painting a new portrait…';
const portraitActions = {
  'regenerate-portrait': { id: 'portrait', loadingLabel: paintingLabel },
  'apply-portrait-edit': { id: 'portrait', loadingLabel: 'Applying edit…' },
  'retry-portrait': { id: 'retry-portrait', loadingLabel: paintingLabel },
  'empty-portrait': { id: 'empty-portrait', loadingLabel: paintingLabel },
};

export function createSpecimenActionProgress(byId, onCancel) {
  const cad = createActionProgress(byId, { id: 'cad', buttonId: 'generate-cad', loadingLabel: 'Generating CAD…', onCancel });
  const portraits = Object.fromEntries([...new Set(Object.values(portraitActions).map(action => action.id))]
    .map(id => [id, createActionProgress(byId, { id, onCancel })]));
  return (job, title, specimen) => {
    const current = job?.specimenId === specimen?.id ? job : null;
    cad.update(current?.kind === JOB_KINDS.CAD ? current : null, title);
    const buttonId = current?.actionButtonId || (specimen?.image ? 'regenerate-portrait' : 'empty-portrait');
    const action = portraitActions[buttonId];
    if (current?.kind === JOB_KINDS.PORTRAIT && buttonId === 'apply-portrait-edit') byId('portrait-edit-form')?.closest('details').setAttribute('open', '');
    for (const [id, progress] of Object.entries(portraits)) {
      progress.update(current?.kind === JOB_KINDS.PORTRAIT && action?.id === id ? current : null, title, action?.id === id ? { buttonId, loadingLabel: action.loadingLabel } : {});
    }
  };
}
