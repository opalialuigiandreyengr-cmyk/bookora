import { supabase } from './supabase';

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
  { id: 'openrouter/free', label: 'Auto Free Router', note: 'Best available free model' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', note: 'Strong Taglish & tasks' },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B', note: 'Fast & balanced' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Fast', note: '1M ctx · rapid replies' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra', note: 'Deep reasoning' },
  { id: 'baidu/ernie-5.5-flash-preview:free', label: 'ERNIE 5.5 Flash', note: '1M ctx · preview' },
];

export const ASSISTANT_QUICK_PROMPTS = [
  'Summarize my bookings and revenue this month',
  'Draft a friendly Taglish reminder for upcoming bookings',
  'Book Maria Santos for Gel Manicure tomorrow 2:00 PM',
  'Add Classic Pedicure ₱350 (45m) and Nail Removal ₱150 (20m) to services',
  'Block lunch break tomorrow 12:00 PM to 1:00 PM',
];

async function extractErrorMessage(error: unknown): Promise<{ message: string; configured: boolean }> {
  const errObj = error as {
    message?: string;
    context?: { status?: number; json?: () => Promise<Record<string, unknown>> };
  } | null;

  let parsedMessage = '';
  let configured = true;

  try {
    const ctx = errObj?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (typeof body?.error === 'string' && body.error.trim()) {
        parsedMessage = body.error.trim();
      }
      if (body?.configured === false) {
        configured = false;
      }
    }
  } catch {
    // Ignore non-JSON error body
  }

  const message = parsedMessage || errObj?.message || 'Unable to reach Bookora AI Assistant.';
  const status = errObj?.context?.status;
  if (
    status === 503 ||
    status === 401 ||
    message.toLowerCase().includes('openrouter_api_key') ||
    message.toLowerCase().includes('not set yet') ||
    message.toLowerCase().includes('user not found')
  ) {
    configured = false;
  }
  return { message, configured };
}

export async function askBookoraAssistant(
  history: { role: 'user' | 'assistant'; content: string }[],
  model?: string
): Promise<{
  ok: boolean;
  configured: boolean;
  reply: string;
  actions: AssistantAction[];
  model?: string;
  error?: string;
}> {
  if (!supabase) {
    return {
      ok: false,
      configured: false,
      reply: '',
      actions: [],
      error: 'Supabase is not configured.',
    };
  }

  const { data, error } = await supabase.functions.invoke('bookora-ai-assistant', {
    body: { messages: history, model: model || 'openrouter/free' },
  });

  if (error) {
    const parsed = await extractErrorMessage(error);
    return {
      ok: false,
      configured: parsed.configured,
      reply: '',
      actions: [],
      error: parsed.message,
    };
  }

  if (data?.configured === false) {
    return {
      ok: false,
      configured: false,
      reply: '',
      actions: [],
      error: String(data?.error || 'OpenRouter API key is not configured yet.'),
    };
  }

  return {
    ok: true,
    configured: true,
    reply: String(data?.reply || ''),
    actions: Array.isArray(data?.actions) ? (data.actions as AssistantAction[]) : [],
    model: data?.model ? String(data.model) : undefined,
  };
}

