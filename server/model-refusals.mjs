import { PROVIDERS, providerLabels, GENERATION_STAGES } from '../shared/generation-models.mjs';

export const MODEL_FAILURE_KINDS = Object.freeze({ BLOCKED: 'blocked', DECLINED: 'declined', OTHER: 'other' });
const safetyCodes = new Set(['cyberPolicy', 'misalignmentPolicyViolation', 'moderation_blocked', 'content_policy_violation', 'content_filter']);
const safetyText = /\bmoderation[_ -]blocked\b|\bcontent[_ -]policy[_ -]violation\b|\b(?:blocked|rejected|refused|violat\w*)\b[^.\n]{0,100}\b(?:safety|content policy|moderation)\b|\b(?:safety|content policy|moderation|content filter)\b[^.\n]{0,100}\b(?:block\w*|reject\w*|refus\w*|violat\w*|prevent\w*)\b/i;
const declinedText = /\b(?:I|we)\s+(?:cannot|can['’]t|won['’]t|will not|must decline|decline to)\b|\b(?:I am|I['’]m|we are|we['’]re)\s+(?:unable|not able)\b/i;
const stageActions = Object.freeze({
  [GENERATION_STAGES.DESIGN]: 'write this specimen', [GENERATION_STAGES.IMAGE]: 'paint this portrait',
  [GENERATION_STAGES.CAD_DESIGN]: 'plan this sculpture', [GENERATION_STAGES.DESIGN_REVIEW]: 'review this specimen',
  [GENERATION_STAGES.IMAGE_REVIEW]: 'review this portrait',
});

export const safeError = error => String(error?.message || error)
  .replace(/\bsk-[\w-]+/g, '[redacted]').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]').slice(0, 900);

export function replyExcerpt(text) {
  const line = safeError(text).replace(/\s+/g, ' ').trim();
  return line.length > 160 ? line.slice(0, 159).trimEnd() + '…' : line;
}

export function failureReason(failure, fallback = 'The model could not complete this request.') {
  if (typeof failure === 'string') return failure;
  if (failure?.message) return failure.message;
  if (failure?.errors?.length) return failure.errors.join(' ');
  if (failure?.type === 'usageLimitExceeded') return 'The image generation usage limit was reached.';
  return failure?.additionalDetails || (failure ? JSON.stringify(failure) : fallback);
}

const failureHeadlines = Object.freeze({
  [MODEL_FAILURE_KINDS.BLOCKED]: ({ provider, stage, imageTool }) => imageTool ? 'The image safety filter blocked this portrait.' :
    `${providerLabels[provider]} blocked the request to ${stageActions[stage]} for safety reasons.`,
  [MODEL_FAILURE_KINDS.DECLINED]: ({ provider, stage, reply }) =>
    `${providerLabels[provider]} declined to ${stageActions[stage]}${reply ? `: “${replyExcerpt(reply)}”` : ''}.`,
  [MODEL_FAILURE_KINDS.OTHER]: ({ reason }) => safeError(reason),
});

// Adapters retain the evidence; only display messages are shortened and redacted.
export function modelFailure({ provider, stage = GENERATION_STAGES.DESIGN, failure = null, reply = '', declined = false,
  imageTool = false, fallback }) {
  const reason = failureReason(failure, fallback);
  const codes = [failure?.type, failure?.code, failure?.codexErrorInfo];
  const evidence = typeof failure === 'string' ? failure : [failure?.message, failure?.additionalDetails, ...(failure?.errors ?? [])].filter(Boolean).join('\n');
  const prose = !imageTool && !/^\s*[\[{]/.test(reply) ? reply : '';
  const blocked = codes.some(code => safetyCodes.has(code)) || safetyText.test(`${evidence}\n${prose}`);
  const kind = blocked ? MODEL_FAILURE_KINDS.BLOCKED : declined || declinedText.test(prose) ? MODEL_FAILURE_KINDS.DECLINED : MODEL_FAILURE_KINDS.OTHER;
  const detail = { kind, provider, stage, reply, reason, imageTool };
  return Object.assign(new Error(failureHeadlines[kind](detail)), { modelFailure: detail,
    providerResponse: { text: reply, failure }, ...(failure?.code ? { code: failure.code } : {}) });
}

export function parseModelReply(result, stage) {
  try { return JSON.parse(result.text); }
  catch {
    const label = providerLabels[result.provider];
    throw modelFailure({ provider: result.provider, stage, reply: result.text,
      fallback: `${label} returned an unreadable response${result.text?.trim() ? `: “${replyExcerpt(result.text)}”` : ''}.` });
  }
}

export function missingPortrait(items, reply) {
  const failure = [...items].reverse().find(item => item.failure)?.failure ?? null;
  return modelFailure({ provider: PROVIDERS.CODEX, stage: GENERATION_STAGES.IMAGE, failure, reply, imageTool: Boolean(failure),
    fallback: `${providerLabels[PROVIDERS.CODEX]} returned no image${reply?.trim() ? `: “${replyExcerpt(reply)}”` : ''}.` });
}

const savedAssets = specimen => specimen?.print ? 'The field notes, current portrait and existing CAD' : 'The field notes and current portrait';

function imageRecovery(specimen, instructions, kind) {
  if (specimen?.image) return `${savedAssets(specimen)} are unchanged; ${
    instructions ? 'revise the edit instructions and use Apply edit again.' : 'use Another portrait, or edit the current portrait.'}`;
  return `The field notes are saved; use Retry portrait${kind === MODEL_FAILURE_KINDS.OTHER ? '.' :
    ', or soften the description or sliders and generate a new specimen.'}`;
}

const recoveryMessages = Object.freeze({
  [GENERATION_STAGES.DESIGN]: () => 'No specimen was saved; adjust the description and try again.',
  [GENERATION_STAGES.IMAGE]: (specimen, instructions, kind) => imageRecovery(specimen, instructions, kind),
  [GENERATION_STAGES.CAD_DESIGN]: specimen => `${savedAssets(specimen)} are unchanged; try another portrait or request CAD again.`,
  [GENERATION_STAGES.DESIGN_REVIEW]: () => 'The saved specimen is unchanged; inspect its requirements manually.',
  [GENERATION_STAGES.IMAGE_REVIEW]: () => 'The portrait is saved; inspect its requirements manually.',
});

export function modelFailureMessage(error, { specimen, instructions = '' } = {}) {
  const detail = error?.modelFailure;
  return detail ? `${failureHeadlines[detail.kind](detail)} ${recoveryMessages[detail.stage](specimen, instructions, detail.kind)}` : safeError(error);
}
