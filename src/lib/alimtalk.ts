import { supabase } from './supabase';

export type AlimtalkAlertType =
  | 'check_in'
  | 'check_out'
  | 'homework_done'
  | 'homework_incomplete'
  | 'homework_undone'
  | 'payment_request'
  | 'payment_paid'
  | 'exam_result'
  | 'custom';

export interface SendAlimtalkPayload {
  studentId?: string;
  paymentId?: string;
  alertType: AlimtalkAlertType;
  recipientPhone: string;
  recipientName?: string;
  subject: string;
  message: string;
  fallbackMessage?: string;
}

export async function sendAlimtalk(payload: SendAlimtalkPayload): Promise<void> {
  const { error } = await supabase.functions.invoke('send-alimtalk', { body: payload });
  if (error) throw error;
}
