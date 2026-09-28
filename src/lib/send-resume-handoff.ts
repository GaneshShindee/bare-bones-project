/** Handoff when leaving Send → Resume Studio so we can return and attach without regenerating email. */

export const SEND_RESUME_HANDOFF_KEY = "send-email-resume-handoff";

export type SendResumeHandoff = {
  /** Keep existing subject/body — do not AI-generate a new email. */
  attachOnly: true;
  subject: string;
  body: string;
  recipientText?: string;
  vars?: Record<string, string>;
  company?: string;
  role?: string;
  jobDescription?: string;
  jobContext?: string;
  instructions?: string;
  resumeVersionId?: string;
  /** Community job id when started from Jobs → Generate Email. */
  jobId?: string;
};

export function saveSendResumeHandoff(payload: SendResumeHandoff): void {
  try {
    sessionStorage.setItem(SEND_RESUME_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekSendResumeHandoff(): SendResumeHandoff | null {
  try {
    const raw = sessionStorage.getItem(SEND_RESUME_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SendResumeHandoff;
    if (!parsed?.attachOnly) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function takeSendResumeHandoff(): SendResumeHandoff | null {
  const h = peekSendResumeHandoff();
  try {
    sessionStorage.removeItem(SEND_RESUME_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
  return h;
}

export function clearSendResumeHandoff(): void {
  try {
    sessionStorage.removeItem(SEND_RESUME_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}
