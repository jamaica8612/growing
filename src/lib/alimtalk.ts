import { supabase } from './supabase';
import {
  parseAlimtalkRequest,
  type AlimtalkAlertType,
  type ValidatedAlimtalkRequest,
} from '../../supabase/functions/send-alimtalk/policy';

export type { AlimtalkAlertType };

export interface SendAlimtalkPayload {
  studentId: string;
  paymentId?: string;
  alertType: AlimtalkAlertType;
  /** @deprecated The server always uses the student's saved parent contact. */
  recipientPhone?: string;
  /** @deprecated The server always uses the student's saved name. */
  recipientName?: string;
  subject: string;
  message: string;
  fallbackMessage?: string;
}

export function buildAlimtalkRequestBody(payload: SendAlimtalkPayload): ValidatedAlimtalkRequest {
  const parsed = parseAlimtalkRequest(payload);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

export async function sendAlimtalk(payload: SendAlimtalkPayload): Promise<void> {
  const body = buildAlimtalkRequestBody(payload);
  const { error } = await supabase.functions.invoke('send-alimtalk', { body });
  if (!error) return;

  const context = 'context' in error ? error.context : null;
  if (context instanceof Response) {
    let serverMessage = '';
    try {
      const responseBody: unknown = await context.clone().json();
      if (
        typeof responseBody === 'object'
        && responseBody !== null
        && 'error' in responseBody
        && typeof responseBody.error === 'string'
      ) {
        serverMessage = responseBody.error;
      }
    } catch {
      // Fall back to the Supabase Functions error when the response is not JSON.
    }
    if (serverMessage) throw new Error(serverMessage);
  }
  throw error;
}
