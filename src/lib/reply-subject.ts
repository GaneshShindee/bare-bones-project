/** Shared subject helpers for replies (client preview + server send). */

const RE_PREFIX = /^\s*(re|aw|antw|res|sv|vs)\s*(\[\d+\])?\s*:\s*/i;

export function stripReplyPrefix(subject: string): string {
  let s = subject ?? "";
  while (RE_PREFIX.test(s)) s = s.replace(RE_PREFIX, "");
  return s.trim();
}

/** "Re: <original>" without stacking multiple Re: prefixes. */
export function replyPreviewSubject(subject: string): string {
  return `Re: ${stripReplyPrefix(subject)}`;
}
