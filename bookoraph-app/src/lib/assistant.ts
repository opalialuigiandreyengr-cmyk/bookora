import { supabase } from './supabase';

export type AssistantToolCall = {
  id: string;
  tool: string;
  page: string;
  status: 'running' | 'done' | 'error';
  count: number;
  duration_ms: number;
  summary: string;
};

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string | null;
  thinkingSeconds?: number | null;
  toolCalls?: AssistantToolCall[];
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
    type: 'delete_service';
    label: string;
    data: {
      service_id?: string;
      name: string;
    };
  }
  | {
    type: 'delete_appointment';
    label: string;
    data: {
      appointment_id?: string;
      customer_name?: string;
      appointment_date?: string;
      appointment_time?: string;
    };
  }
  | {
    type: 'delete_client';
    label: string;
    data: {
      client_id?: string;
      full_name?: string;
    };
  }
  | {
    type: 'delete_block_time';
    label: string;
    data: {
      block_id?: string;
      title?: string;
      event_date?: string;
      start_time?: string;
    };
  }
  | {
    type: 'add_time_off';
    label: string;
    data: {
      title: string;
      startDate: string;
      endDate?: string;
      startTime?: string;
      endTime?: string;
      allDay?: boolean;
      repeat?: 'none' | 'weekly' | 'monthly';
    };
  }
  | {
    type: 'delete_time_off';
    label: string;
    data: {
      time_off_id?: string;
      title?: string;
      startDate?: string;
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

export const DEFAULT_FREE_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

export const OPENROUTER_FREE_MODELS: OpenRouterFreeModelOption[] = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra', note: '550B · default reasoning' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', note: '1M ctx · rapid replies' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', note: '1M ctx · balanced' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni', note: '30B · reasoning' },
  { id: 'baidu/ernie-5.5-flash-preview:free', label: 'ERNIE 5.5 Flash', note: '1M ctx · fast drafts' },
  { id: 'recursive/flint-v1.0:free', label: 'Recursive Flint v1.0', note: '262k ctx · structured' },
  { id: 'liquid/lfm-3-1.7b:free', label: 'Liquid LFM 3 1.7B', note: 'Lightweight & instant' },
];

export const ASSISTANT_QUICK_PROMPTS = [
  'Summarize bookings & revenue this month',
  'Draft Taglish reminder for upcoming bookings',
  'Book Maria Santos · Gel Manicure tomorrow 2 PM',
  'Add Classic Pedicure ₱350 (45m) and Nail Removal ₱150 (20m)',
  'Add time off tomorrow 12:00 PM to 1:00 PM',
];

export type AssistantStreamHandlers = {
  onToolStart?: (tool: AssistantToolCall) => void;
  onToolDone?: (tool: AssistantToolCall) => void;
  onThinkingStart?: () => void;
  onThinkingDelta?: (text: string) => void;
  onContentDelta?: (text: string) => void;
};

export async function askBookoraAssistant(
  history: { role: 'user' | 'assistant'; content: string }[],
  model?: string,
  signal?: AbortSignal,
  handlers?: AssistantStreamHandlers
): Promise<{
  ok: boolean;
  aborted?: boolean;
  configured: boolean;
  reply: string;
  thinking: string | null;
  thinkingSeconds: number | null;
  toolCalls: AssistantToolCall[];
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
      toolCalls: [],
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
        toolCalls: [],
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
      body: JSON.stringify({ messages: history, model: model || DEFAULT_FREE_MODEL, stream: true }),
      signal,
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/x-ndjson')) {
      const liveTools: AssistantToolCall[] = [];
      let finalPayload: Record<string, unknown> | null = null;
      let streamError: { error: string; status: number; configured: boolean; toolCalls: AssistantToolCall[] } | null = null;

      const handleLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        try {
          const ev = JSON.parse(line) as Record<string, unknown>;
          if (ev.type === 'tool_start' && ev.tool && typeof ev.tool === 'object') {
            const t = ev.tool as AssistantToolCall;
            liveTools.push(t);
            handlers?.onToolStart?.(t);
          } else if (ev.type === 'tool_done' && ev.tool && typeof ev.tool === 'object') {
            const t = ev.tool as AssistantToolCall;
            const idx = liveTools.findIndex((item) => item.id === t.id);
            if (idx >= 0) liveTools[idx] = t;
            else liveTools.push(t);
            handlers?.onToolDone?.(t);
          } else if (ev.type === 'thinking_start') {
            handlers?.onThinkingStart?.();
          } else if (ev.type === 'thinking_delta' && typeof ev.text === 'string') {
            handlers?.onThinkingDelta?.(ev.text);
          } else if (ev.type === 'content_delta' && typeof ev.text === 'string') {
            handlers?.onContentDelta?.(ev.text);
          } else if (ev.type === 'result' && ev.data && typeof ev.data === 'object') {
            finalPayload = ev.data as Record<string, unknown>;
          } else if (ev.type === 'error') {
            streamError = {
              error: String(ev.error || 'Request failed'),
              status: Number(ev.status || 500),
              configured: ev.configured !== false,
              toolCalls: Array.isArray(ev.tool_calls) ? (ev.tool_calls as AssistantToolCall[]) : liveTools,
            };
          }
        } catch {
          // Ignore malformed stream chunk
        }
      };

      const reader = res.body?.getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            handleLine(line);
          }
        }
        if (buffer.trim()) handleLine(buffer);
      } else {
        const fullText = await res.text();
        for (const line of fullText.split('\n')) {
          handleLine(line);
        }
      }

      if (streamError) {
        const se = streamError as { error: string; status: number; configured: boolean; toolCalls: AssistantToolCall[] };
        const configured = se.configured === false || se.status === 503 || se.status === 401 ? false : true;
        return {
          ok: false,
          configured,
          reply: '',
          thinking: null,
          thinkingSeconds: null,
          toolCalls: se.toolCalls,
          actions: [],
          error: se.error,
        };
      }

      if (finalPayload) {
        const fp = finalPayload as Record<string, unknown>;
        return {
          ok: true,
          configured: true,
          reply: String(fp.reply || ''),
          thinking: typeof fp.thinking === 'string' && fp.thinking.trim() ? fp.thinking.trim() : null,
          thinkingSeconds: typeof fp.thinking_seconds === 'number' ? fp.thinking_seconds : null,
          toolCalls: Array.isArray(fp.tool_calls) ? (fp.tool_calls as AssistantToolCall[]) : liveTools,
          actions: Array.isArray(fp.actions) ? (fp.actions as AssistantAction[]) : [],
          model: fp.model ? String(fp.model) : undefined,
        };
      }
    }

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
        toolCalls: [],
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
      toolCalls: Array.isArray(data?.tool_calls) ? (data.tool_calls as AssistantToolCall[]) : [],
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
        toolCalls: [],
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
      toolCalls: [],
      actions: [],
      error: err instanceof Error ? err.message : 'Unable to reach Bookora AI Assistant.',
    };
  }
}
