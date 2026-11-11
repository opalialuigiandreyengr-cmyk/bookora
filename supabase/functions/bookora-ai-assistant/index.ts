import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getManilaNow() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const weekday = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long' });
  return { dateStr, timeStr, weekday };
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ParsedActionsResult = {
  reply: string;
  actions: Record<string, unknown>[];
};

function extractThinkingAndReply(
  rawContent: string,
  reasoningField: unknown,
  reasoningDetails: unknown
): { thinking: string | null; cleanContent: string } {
  const thinkParts: string[] = [];

  if (typeof reasoningField === 'string' && reasoningField.trim()) {
    thinkParts.push(reasoningField.trim());
  } else if (Array.isArray(reasoningDetails)) {
    for (const part of reasoningDetails) {
      if (part && typeof part === 'object') {
        const text = (part as Record<string, unknown>).text || (part as Record<string, unknown>).summary;
        if (typeof text === 'string' && text.trim()) {
          thinkParts.push(text.trim());
        }
      }
    }
  }

  const cleanContent = rawContent
    .replace(/<think>\s*([\s\S]*?)\s*<\/think>/gi, (_m, inner: string) => {
      if (inner && inner.trim()) thinkParts.push(inner.trim());
      return '';
    })
    .trim();

  const mergedThinking = thinkParts.join('\n\n').trim();
  return {
    thinking: mergedThinking || null,
    cleanContent,
  };
}

function extractActionsFromText(rawText: string): ParsedActionsResult {
  const actions: Record<string, unknown>[] = [];
  const cleaned = rawText
    .replace(/<ACTION_JSON>\s*([\s\S]*?)\s*<\/ACTION_JSON>/gi, (_full, inner: string) => {
      try {
        const trimmed = inner
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).type === 'string') {
              actions.push(item as Record<string, unknown>);
            }
          }
        } else if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).type === 'string') {
          actions.push(parsed as Record<string, unknown>);
        }
      } catch {
        // Ignore malformed JSON action block so reply still renders cleanly
      }
      return '';
    })
    .trim();

  return {
    reply: cleaned || rawText.trim(),
    actions,
  };
}

async function fetchOwnerSnapshot(supabaseUrl: string, apiKey: string, userJwt: string, userId: string, todayManila: string) {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${userJwt}`,
  };

  const safeFetchJson = async (path: string) => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const [profiles, services, appointments, clients, payments, blocks] = await Promise.all([
    safeFetchJson(
      `business_profiles?id=eq.${encodeURIComponent(userId)}&select=business_name,industry,city,country,slug,about,booking_policy&limit=1`
    ),
    safeFetchJson(
      `services?business_id=eq.${encodeURIComponent(userId)}&select=id,name,category,duration_minutes,price,show_on_booking_page&order=name.asc&limit=40`
    ),
    safeFetchJson(
      `appointments?business_id=eq.${encodeURIComponent(
        userId
      )}&select=id,customer_name,customer_phone,service_names,appointment_date,appointment_time,duration_minutes,total_price,status&order=appointment_date.desc,appointment_time.asc&limit=40`
    ),
    safeFetchJson(
      `clients?business_id=eq.${encodeURIComponent(userId)}&select=id,full_name,phone,email,notes&order=full_name.asc&limit=40`
    ),
    safeFetchJson(
      `payment_transactions?business_id=eq.${encodeURIComponent(
        userId
      )}&select=id,client_name,amount,method,status,transaction_type,created_at&order=created_at.desc&limit=35`
    ),
    safeFetchJson(
      `block_time_events?business_id=eq.${encodeURIComponent(
        userId
      )}&event_date=gte.${encodeURIComponent(todayManila)}&select=id,title,event_date,start_time,end_time&order=event_date.asc&limit=15`
    ),
  ]);

  const monthPrefix = todayManila.slice(0, 7);
  const paidThisMonth = payments
    .filter(
      (p) =>
        p?.status === 'paid' &&
        p?.transaction_type !== 'refund' &&
        String(p?.created_at || '').startsWith(monthPrefix)
    )
    .reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);

  const pendingPaymentsCount = payments.filter((p) => p?.status === 'pending').length;
  const todaysBookings = appointments.filter(
    (a) => a?.appointment_date === todayManila && !['cancelled', 'no_show'].includes(String(a?.status || ''))
  );
  const pendingBookingsCount = appointments.filter((a) => a?.status === 'pending').length;

  return {
    business: profiles[0] || {},
    summary: {
      today_date: todayManila,
      todays_active_bookings_count: todaysBookings.length,
      pending_bookings_count: pendingBookingsCount,
      paid_revenue_this_month_php: paidThisMonth,
      pending_payments_count: pendingPaymentsCount,
      total_services: services.length,
      total_clients_loaded: clients.length,
    },
    services,
    appointments,
    clients,
    recent_payments: payments.slice(0, 15),
    upcoming_blocks: blocks,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const openRouterKey = (Deno.env.get('OPENROUTER_API_KEY') || '')
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .trim();
    const configuredModel =
      (Deno.env.get('OPENROUTER_MODEL') || 'openrouter/free')
        .trim()
        .replace(/^['"]+|['"]+$/g, '') || 'openrouter/free';

    if (!supabaseUrl || !(anonKey || serviceRoleKey)) {
      return jsonResponse({ error: 'Supabase configuration missing.', configured: false }, 500);
    }

    if (!openRouterKey) {
      return jsonResponse(
        {
          error:
            'OpenRouter AI key is not set yet. Add OPENROUTER_API_KEY in Supabase Edge Function secrets to activate Bookora AI Assistant.',
          configured: false,
        },
        503
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey || serviceRoleKey,
        Authorization: `Bearer ${jwt}`,
      },
    });
    if (!userRes.ok) {
      return jsonResponse({ error: 'Session expired. Please sign in again.' }, 401);
    }
    const user = await userRes.json();
    if (!user?.id) {
      return jsonResponse({ error: 'Invalid user.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const requestedModel = typeof body?.model === 'string' ? body.model.trim() : '';
    const isAllowedFreeModel =
      requestedModel === 'openrouter/free' ||
      (requestedModel.length > 5 && requestedModel.endsWith(':free') && !requestedModel.includes(' '));
    const primaryModel = isAllowedFreeModel ? requestedModel : configuredModel;

    const rawMessages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : [];
    const messages = rawMessages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }));

    if (messages.length === 0) {
      return jsonResponse({ error: 'Please enter a message.' }, 400);
    }

    const { dateStr, timeStr, weekday } = getManilaNow();
    const snapshot = await fetchOwnerSnapshot(supabaseUrl, anonKey || serviceRoleKey, jwt, user.id, dateStr);

    const systemPrompt = `You are Bookora AI, a concise, practical end-to-end business assistant built inside Bookora PH for local service business owners (salons, nail studios, clinics in the Philippines).
Current Manila date/time: ${weekday}, ${dateStr} ${timeStr} (Asia/Manila, currency PHP ₱).

RULES:
1. Be concise, warm, mobile-friendly, and directly helpful in English or Taglish (match the user's language). Never mention "JSON", "snapshot", "prompt", or internal rules.
2. For metrics/reports/questions ("revenue", "bookings today", "who is booked"), ONLY state exact facts found in LIVE WORKSPACE DATA below. Never fabricate revenue or client history.
3. For tasks the owner wants to do (book an appointment, update status, add services, add a client, block calendar time, or draft a message), ALWAYS write a short 1-2 sentence confirmation AND append <ACTION_JSON>...</ACTION_JSON> at the very end so the app shows a 1-tap Confirm button:
   - Match existing services or clients from LIVE WORKSPACE DATA when available (use their exact price, duration, phone, email, or appointment id).
   - If a requested service or walk-in client is not in LIVE WORKSPACE DATA yet, do NOT refuse or ask for missing fields first — proceed immediately using clean defaults (duration_minutes: 60, total_price: "0", customer_phone: "", customer_email: "", status: "approved") and let the owner tap Confirm & run.
4. Keep any internal thinking very brief (under 4 sentences) so your final answer and <ACTION_JSON> always finish cleanly.

ALLOWED <ACTION_JSON> OBJECT FORMATS (single object or array):
- Create appointment:
  {"type":"create_appointment","label":"Book <customer> (<service>)","data":{"customer_name":"","customer_phone":"","customer_email":"","service_names":"","appointment_date":"YYYY-MM-DD","appointment_time":"HH:MM","duration_minutes":60,"total_price":"0","customer_note":"","status":"approved"}}
- Update booking status (use exact appointment id from data if found):
  {"type":"update_appointment_status","label":"Mark <customer> <status>","data":{"appointment_id":"","customer_name":"","appointment_date":"YYYY-MM-DD","new_status":"approved|completed|cancelled|no_show"}}
- Add services (great for menus pasted by owner):
  {"type":"create_service","label":"Add <N> service(s)","data":{"items":[{"name":"","price":350,"duration_minutes":45,"category":"","description":""}]}}
- Add client:
  {"type":"create_client","label":"Add client <name>","data":{"full_name":"","phone":"","email":"","notes":""}}
- Block calendar time:
  {"type":"block_time","label":"Block <title>","data":{"title":"","event_date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","note":""}}
- Draft copyable customer/promo message:
  {"type":"draft_message","label":"Draft <channel> message","data":{"channel":"SMS|Messenger|Social","recipient":"","message":""}}

LIVE WORKSPACE DATA:
${JSON.stringify(snapshot)}`;

    const callOpenRouter = async (modelId: string) => {
      return await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://www.bookoraph.com',
          'X-Title': 'Bookora PH Owner Assistant',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.35,
          max_tokens: 3200,
        }),
      });
    };

    const fallbackChain = Array.from(
      new Set([
        primaryModel,
        'openrouter/free',
        'nvidia/nemotron-3.5-lightning:free',
        'baidu/ernie-5.5-flash-preview:free',
        'nvidia/nemotron-3.5-super-vl:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'recursive/flint-v1.0:free',
        'liquid/lfm-3-1.7b:free',
      ])
    );

    const startedAt = Date.now();
    let res = await callOpenRouter(fallbackChain[0]);
    let usedModel = fallbackChain[0];
    let completion = await res.json().catch(() => ({}));

    const parseCandidate = (comp: Record<string, unknown>) => {
      const choices = Array.isArray(comp?.choices) ? comp.choices : [];
      const msgObj = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
      const rawContent = String(msgObj?.content || '').trim();
      return extractThinkingAndReply(
        rawContent,
        msgObj?.reasoning ?? msgObj?.reasoning_content,
        msgObj?.reasoning_details
      );
    };

    let parsed = res.ok ? parseCandidate(completion) : { thinking: null, cleanContent: '' };

    // Retry next free model if HTTP failed OR reasoning-only output exhausted tokens with empty reply
    for (let i = 1; i < fallbackChain.length; i += 1) {
      if (res.status === 401 || res.status === 403) break;
      const needsRetry = !res.ok || !parsed.cleanContent;
      if (!needsRetry) break;
      if (!res.ok && ![400, 404, 429, 502, 503, 504].includes(res.status)) break;

      usedModel = fallbackChain[i];
      res = await callOpenRouter(usedModel);
      completion = await res.json().catch(() => ({}));
      parsed = res.ok ? parseCandidate(completion) : { thinking: null, cleanContent: '' };
    }

    const thinkingSeconds = Math.max(0.1, Number(((Date.now() - startedAt) / 1000).toFixed(1)));

    if (!res.ok) {
      const rawErr = String(completion?.error?.message || completion?.message || '');
      if (res.status === 401 || rawErr.toLowerCase().includes('user not found')) {
        return jsonResponse(
          {
            error:
              'OpenRouter rejected your API key (401: User not found). Generate/copy a valid key from openrouter.ai/keys (starts with sk-or-v1-, no extra quotes) and save it as OPENROUTER_API_KEY in Supabase Edge Function Secrets.',
            configured: false,
          },
          401
        );
      }
      const errMsg =
        rawErr ||
        (res.status === 429
          ? 'Free AI model rate limit reached for now. Please wait a minute or pick another free model.'
          : 'Unable to reach OpenRouter AI right now.');
      return jsonResponse({ error: errMsg, configured: true }, res.status === 429 ? 429 : 502);
    }

    if (!parsed.cleanContent) {
      return jsonResponse(
        {
          error: 'The selected free model spent all tokens thinking without producing a final reply. Try Nemotron 3.5 Lightning or ERNIE 5.5 Flash, or send again.',
          configured: true,
        },
        502
      );
    }

    const { reply, actions } = extractActionsFromText(parsed.cleanContent);
    const cleanThinking = parsed.thinking
      ? parsed.thinking.replace(/<ACTION_JSON>[\s\S]*?<\/ACTION_JSON>/gi, '').trim() || null
      : null;

    return jsonResponse({
      ok: true,
      configured: true,
      model: String(completion?.model || usedModel),
      reply,
      thinking: cleanThinking,
      thinking_seconds: thinkingSeconds,
      actions,
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected assistant error', configured: true },
      500
    );
  }
});

