import { supabase } from './supabase';

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string | null;
  thinkingSeconds?: number | null;
  actions?: AssistantAction[];
  model?: string;
};

export type AssistantAction =
  | {
    type: 'create_appointment';
    label: string;
    data: {
      customer_name: string;
      customer_phone?: string;
      customer_email?: string;
      service_names: string;
      appointment_date: string;
      appointment_time: string;
      duration_minutes?: number;
      total_price?: string | number;
      customer_note?: string;
      status?: 'pending' | 'approved' | 'completed';
    };
  }
  | {
    type: 'update_appointment_status';
    label: string;
    data: {
      appointment_id?: string;
      customer_name?: string;
      appointment_date?: string;
      new_status: 'approved' | 'completed' | 'cancelled' | 'no_show';
    };
  }
  | {
    type: 'create_service';
    label: string;
    data: {
      items: {
        name: string;
        price: number | string;
        duration_minutes?: number;
        category?: string;
        description?: string;
      }[];
    };
  }
  | {
    type: 'create_client';
    label: string;
    data: {
      full_name: string;
      phone?: string;
      email?: string;
      notes?: string;
    };
  }
  | {
    type: 'block_time';
    label: string;
    data: {
      title: string;
      event_date: string;
      start_time: string;
      end_time: string;
      note?: string;
    };
  }
  | {
    type: 'draft_message';
    label: string;
    data: {
      channel?: string;
      recipient?: string;
      message: string;
    };
  };

export type OpenRouterFreeModelOption = {
  id: string;
  label: string;
  note: string;
};

export const OPENROUTER_FREE_MODELS: OpenRouterFreeModelOption[] = [
  { id: 'openrouter/free', label: 'Auto Free Router', note: 'Best live free model' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', note: '1M ctx · rapid replies' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra', note: '550B · deep reasoning' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', note: '1M ctx · balanced' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni', note: '30B · reasoning' },
  { id: 'baidu/ernie-5.5-flash-preview:free', label: 'ERNIE 5.5 Flash', note: '1M ctx · fast drafts' },
  { id: 'recursive/flint-v1.0:free', label: 'Recursive Flint v1.0', note: '262k ctx · structured' },
  { id: 'liquid/lfm-3-1.7b:free', label: 'Liquid LFM 3 1.7B', note: 'Lightweight & instant' },
];

export const ASSISTANT_QUICK_PROMPTS = [
  'Summarize my bookings and revenue this month',
  'Draft a friendly Taglish reminder for upcoming bookings',
  'Book Maria Santos for Gel Manicure tomorrow 2:00 PM',
  'Add Classic Pedicure ₱350 (45m) and Nail Removal ₱150 (20m) to services',
  'Block lunch break tomorrow 12:00 PM to 1:00 PM',
];

export async function askBookoraAssistant(
  history: { role: 'user' | 'assistant'; content: string }[],
  model?: string,
  signal?: AbortSignal
): Promise<{
  ok: boolean;
  aborted?: boolean;
  configured: boolean;
  reply: string;
  thinking: string | null;
  thinkingSeconds: number | null;
  actions: AssistantAction[];
  model?: string;
  error?: string;
}> {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!supabase || !supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      configured: false,
      reply: '',
      thinking: null,
      thinkingSeconds: null,
      actions: [],
      error: 'Supabase is not configured.',
    };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return {
        ok: false,
        configured: true,
        reply: '',
        thinking: null,
        thinkingSeconds: null,
        actions: [],
        error: 'Session expired. Please sign in again.',
      };
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/bookora-ai-assistant`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: history, model: model || 'openrouter/free' }),
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.configured === false) {
      const msg = String(data?.error || `Request failed (${res.status})`);
      const configured =
        data?.configured === false || res.status === 503 || res.status === 401 ? false : true;
      return {
        ok: false,
        configured,
        reply: '',
        thinking: null,
        thinkingSeconds: null,
        actions: [],
        error: msg,
      };
    }

    return {
      ok: true,
      configured: true,
      reply: String(data?.reply || ''),
      thinking: typeof data?.thinking === 'string' && data.thinking.trim() ? data.thinking.trim() : null,
      thinkingSeconds:
        typeof data?.thinking_seconds === 'number' ? data.thinking_seconds : null,
      actions: Array.isArray(data?.actions) ? (data.actions as AssistantAction[]) : [],
      model: data?.model ? String(data.model) : undefined,
    };
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))) {
      return {
        ok: false,
        aborted: true,
        configured: true,
        reply: '',
        thinking: null,
        thinkingSeconds: null,
        actions: [],
        error: 'Stopped.',
      };
    }
    return {
      ok: false,
      configured: true,
      reply: '',
      thinking: null,
      thinkingSeconds: null,
      actions: [],
      error: err instanceof Error ? err.message : 'Unable to reach Bookora AI Assistant.',
    };
  }
}
