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

function looksLikeLeakedThought(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/\b(LIVE WORKSPACE DATA|ALLOWED <ACTION_JSON>|The instruction says|The system says|Maybe we can omit)\b/i.test(trimmed)) {
    return true;
  }
  const firstLine = trimmed.split(/\r?\n/)[0] || '';
  return /^(We need|Let's check|Let's analyze|User asks:|The user asks|Hmm,|Thinking Process:|Step 1:)/i.test(firstLine);
}

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

  let working = rawContent;

  // 1. Extract paired <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>
  working = working.replace(/<(think|thought|reasoning)>\s*([\s\S]*?)\s*<\/\1>/gi, (_m, _tag, inner: string) => {
    if (inner && inner.trim()) thinkParts.push(inner.trim());
    return '';
  });

  // 2. Handle unpaired closing </think> or </thought> (thinking precedes tag)
  const unpairedClose = working.match(/^([\s\S]*?)<\/(?:think|thought|reasoning)>([\s\S]*)$/i);
  if (unpairedClose) {
    if (unpairedClose[1]?.trim()) thinkParts.push(unpairedClose[1].trim());
    working = unpairedClose[2] || '';
  }

  // 3. Handle unclosed opening <think> (model ran out of tokens inside tag)
  const unclosedOpen = working.match(/^([\s\S]*?)<(?:think|thought|reasoning)>([\s\S]*)$/i);
  if (unclosedOpen) {
    if (unclosedOpen[2]?.trim()) thinkParts.push(unclosedOpen[2].trim());
    working = unclosedOpen[1] || '';
  }

  let cleanContent = working.trim();

  // 4. Reject raw internal scratchpad leaks if a model omitted tags altogether
  if (cleanContent && looksLikeLeakedThought(cleanContent)) {
    thinkParts.push(cleanContent);
    cleanContent = '';
  }

  const mergedThinking = thinkParts.join('\n\n').trim();
  return {
    thinking: mergedThinking || null,
    cleanContent,
  };
}

const KNOWN_ACTION_TYPES = new Set([
  'create_appointment',
  'update_appointment_status',
  'create_service',
  'create_client',
  'block_time',
  'add_time_off',
  'delete_service',
  'delete_appointment',
  'delete_client',
  'delete_block_time',
  'delete_time_off',
  'draft_message',
]);

function parseActionPayload(rawInner: string): Record<string, unknown>[] {
  const candidates: string[] = [];
  const cleanedInner = rawInner
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!cleanedInner) return [];
  candidates.push(cleanedInner);
  candidates.push(cleanedInner.replace(/,\s*([}\]])/g, '$1'));

  for (const cand of candidates) {
    try {
      const parsed = JSON.parse(cand);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const valid = list.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object' && KNOWN_ACTION_TYPES.has(String((item as Record<string, unknown>).type || '')))
      );
      if (valid.length > 0) return valid;
    } catch {
      // Try next cleanup candidate
    }
  }
  return [];
}

function extractActionsFromText(rawText: string): ParsedActionsResult {
  const actions: Record<string, unknown>[] = [];
  const hadActionTag = /<ACTION_JSON/i.test(rawText);

  let working = rawText
    // 1. Complete paired <ACTION_JSON>...</ACTION_JSON>
    .replace(/<ACTION_JSON>\s*([\s\S]*?)\s*<\/ACTION_JSON>/gi, (_full, inner: string) => {
      actions.push(...parseActionPayload(inner));
      return '';
    })
    // 2. Unclosed trailing <ACTION_JSON>... (truncated or missing closing tag)
    .replace(/<ACTION_JSON>\s*([\s\S]*)$/gi, (_full, inner: string) => {
      actions.push(...parseActionPayload(inner));
      return '';
    })
    // 3. Bare ```json ... ``` blocks containing a known action object/array
    .replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, (full, inner: string) => {
      const found = parseActionPayload(inner);
      if (found.length > 0) {
        actions.push(...found);
        return '';
      }
      return full;
    })
    // 4. Final scrub of stray action tags
    .replace(/<\/?ACTION_JSON[^>]*>/gi, '')
    .trim();

  if (!working) {
    if (actions.length > 0) {
      working = 'Ready — tap Confirm below to apply.';
    } else if (hadActionTag) {
      working = 'I prepared the action, but the response was cut off before finishing. Please send again.';
    }
  }

  return {
    reply: working,
    actions,
  };
}

type ToolScanEntry = {
  id: string;
  tool: string;
  page: string;
  status: 'running' | 'done' | 'error';
  count: number;
  duration_ms: number;
  summary: string;
};

type ScannerKey =
  | 'overview'
  | 'services'
  | 'calendar'
  | 'clients'
  | 'payments'
  | 'staff'
  | 'automation';

const SCANNER_ORDER: ScannerKey[] = [
  'overview',
  'services',
  'calendar',
  'clients',
  'payments',
  'staff',
  'automation',
];

function selectScannersForPrompt(messages: ChatMessage[]): ScannerKey[] {
  const latest = (messages[messages.length - 1]?.content || '').toLowerCase();
  const combined = messages
    .slice(-3)
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();
  const text = `${latest} ${combined}`;

  if (/\b(all pages|everything|full scan|entire|all data|scan all|overview of everything)\b/i.test(latest)) {
    return [...SCANNER_ORDER];
  }

  const picked = new Set<ScannerKey>();

  if (/\b(service|services|menu|price|pricing|category|categories|package|packages|promo|treatment|manicure|pedicure|facial|hair|nail|wax|massage|add service|delete service|remove service)\b/i.test(text)) {
    picked.add('services');
  }
  if (/\b(book|booking|bookings|appointment|appointments|schedule|scheduled|calendar|slot|slots|tomorrow|today|week|block|blocked|lunch|break|class|classes|waitlist|reschedule|cancel|no_show|no-show|reminder|confirm)\b/i.test(text)) {
    picked.add('calendar');
    picked.add('services');
    picked.add('clients');
  }
  if (/\b(client|clients|customer|customers|member|membership|memberships|loyalty|points|phone|email|contact|maria|juan)\b/i.test(text)) {
    picked.add('clients');
  }
  if (/\b(revenue|sales|income|earn|earning|earnings|payment|payments|paid|pending|refund|billing|invoice|money|php|month|cash|gcash|card)\b/i.test(text)) {
    picked.add('payments');
    picked.add('calendar');
  }
  if (/\b(staff|team|stylist|technician|therapist|employee|barber|specialist|worker|assign)\b/i.test(text)) {
    picked.add('staff');
    picked.add('services');
  }
  if (/\b(setting|settings|profile|hour|hours|open|close|slug|link|address|location|policy|fee|plan|subscription|time off|time-off|break|breaks|leave|day off|holiday|vacation)\b/i.test(text)) {
    picked.add('overview');
  }
  if (/\b(notification|notifications|alert|alerts|report|reports|webhook|webhooks|integration|integrations|google calendar|zoom|email|sms|messenger)\b/i.test(text)) {
    picked.add('automation');
  }

  // If summary or draft or generic request without narrow keyword, scan core pages
  if (/\b(summarize|summary|report|status|how is|how are|draft)\b/i.test(latest) && picked.size < 3) {
    picked.add('overview');
    picked.add('services');
    picked.add('calendar');
    picked.add('payments');
  }

  if (picked.size === 0) {
    return ['overview', 'services', 'calendar', 'clients', 'payments'];
  }

  return SCANNER_ORDER.filter((k) => picked.has(k));
}

function addMinutesToTime(startTime: string, durationMinutes: number): string {
  const parts = String(startTime || '09:00').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const total = Math.max(0, h * 60 + m + (Number(durationMinutes) || 60));
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function scanOwnerPages(
  supabaseUrl: string,
  apiKey: string,
  userJwt: string,
  userId: string,
  todayManila: string,
  selectedKeys: ScannerKey[],
  onToolEvent?: (ev: { type: 'tool_start' | 'tool_done'; tool: ToolScanEntry }) => void
): Promise<{ snapshot: Record<string, unknown>; toolCalls: ToolScanEntry[] }> {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${userJwt}`,
  };

  const uid = encodeURIComponent(userId);

  const safeQuery = async (path: string): Promise<{ ok: boolean; rows: Record<string, unknown>[]; error?: string }> => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === 'object' && 'message' in data
            ? String((data as Record<string, unknown>).message)
            : `HTTP ${res.status}`;
        return { ok: false, rows: [], error: msg };
      }
      return {
        ok: true,
        rows: Array.isArray(data) ? (data as Record<string, unknown>[]) : [],
      };
    } catch (err) {
      return { ok: false, rows: [], error: err instanceof Error ? err.message : 'Query failed' };
    }
  };

  const runScanner = async <T>(
    id: string,
    tool: string,
    page: string,
    fn: () => Promise<{ data: T; count: number; summary: string; hasError?: boolean }>
  ): Promise<{ entry: ToolScanEntry; data: T }> => {
    onToolEvent?.({
      type: 'tool_start',
      tool: {
        id,
        tool,
        page,
        status: 'running',
        count: 0,
        duration_ms: 0,
        summary: `Querying ${page}…`,
      },
    });
    const t0 = Date.now();
    try {
      const result = await fn();
      const entry: ToolScanEntry = {
        id,
        tool,
        page,
        status: result.hasError ? 'error' : 'done',
        count: result.count,
        duration_ms: Math.max(1, Date.now() - t0),
        summary: result.summary,
      };
      onToolEvent?.({ type: 'tool_done', tool: entry });
      return { entry, data: result.data };
    } catch (err) {
      const entry: ToolScanEntry = {
        id,
        tool,
        page,
        status: 'error',
        count: 0,
        duration_ms: Math.max(1, Date.now() - t0),
        summary: err instanceof Error ? err.message : 'Scan failed',
      };
      onToolEvent?.({ type: 'tool_done', tool: entry });
      return { entry, data: {} as T };
    }
  };

  let overviewData: Record<string, unknown> = {};
  let servicesData: { services?: Record<string, unknown>[]; categories?: Record<string, unknown>[]; packages?: Record<string, unknown>[] } = {};
  let calendarData: { appointments?: Record<string, unknown>[]; blocks?: Record<string, unknown>[]; class_sessions?: Record<string, unknown>[]; scheduling_settings?: Record<string, unknown> } = {};
  let clientsData: { clients?: Record<string, unknown>[]; membership_plans?: Record<string, unknown>[]; client_memberships?: Record<string, unknown>[] } = {};
  let paymentsData: { payments?: Record<string, unknown>[]; paidThisMonth?: number; pendingCount?: number } = {};
  let staffData: Record<string, unknown>[] = [];
  let automationData: Record<string, unknown> = {};
  const toolCalls: ToolScanEntry[] = [];

  for (const key of selectedKeys) {
    if (key === 'overview') {
      const res = await runScanner('tool_overview', 'scan_overview_settings', 'Overview & Settings', async () => {
      const [profileRes, subRes] = await Promise.all([
        safeQuery(`business_profiles?id=eq.${uid}&select=*&limit=1`),
        safeQuery(`business_subscriptions?business_id=eq.${uid}&select=*&limit=1`),
      ]);
      const p = profileRes.rows[0] || {};
      const sub = subRes.rows[0] || {};
      const business = {
        business_name: p.business_name || '',
        slug: p.slug || '',
        industry: p.industry || '',
        city: p.city || '',
        country: p.country || '',
        address: p.address || '',
        phone: p.phone || '',
        email: p.email || '',
        about: p.about || '',
        booking_policy: p.booking_policy || '',
        business_hours: p.business_hours || [],
        availability_breaks: p.availability_breaks || {},
        time_off: p.time_off || [],
        booking_fee_enabled: Boolean(p.booking_fee_enabled),
        booking_fee_type: p.booking_fee_type || 'fixed',
        booking_fee_amount: Number(p.booking_fee_amount || 0),
        subscription_plan: sub.plan_id || sub.plan_tier || p.subscription_tier || 'starter',
        subscription_status: sub.status || p.subscription_status || 'active',
      };
      const hasError = !profileRes.ok;
      const summary = hasError
        ? `Settings query error: ${profileRes.error}`
        : `${business.business_name || 'Business profile'} · slug: ${business.slug || 'unset'}`;
      return { data: business, count: profileRes.rows.length, summary, hasError };
    });
    overviewData = res.data;
    toolCalls.push(res.entry);
  } else if (key === 'services') {
    const res = await runScanner('tool_services', 'scan_services_packages', 'Services & Packages', async () => {
      const [svcRes, catRes, pkgRes] = await Promise.all([
        safeQuery(`services?business_id=eq.${uid}&select=*&order=name.asc&limit=100`),
        safeQuery(`service_categories?business_id=eq.${uid}&select=*&order=created_at.asc&limit=50`),
        safeQuery(`service_packages?business_id=eq.${uid}&select=*&order=created_at.desc&limit=40`),
      ]);
      const catMap = new Map<string, string>();
      for (const c of catRes.rows) {
        if (c.id && c.name) catMap.set(String(c.id), String(c.name));
      }
      const services = svcRes.rows.map((s) => ({
        id: s.id,
        name: String(s.name || ''),
        category: String(s.category || (s.category_id ? catMap.get(String(s.category_id)) : '') || 'General'),
        duration_minutes: Number(s.duration_minutes || 60),
        buffer_minutes: Number(s.buffer_minutes || 0),
        price: s.price ?? 0,
        description: String(s.description || ''),
        show_on_booking_page: s.show_on_booking_page !== false,
        deposit_type: String(s.deposit_type || 'none'),
        deposit_amount: Number(s.deposit_amount || 0),
      }));
      const categories = catRes.rows.map((c) => ({ id: c.id, name: String(c.name || '') }));
      const packages = pkgRes.rows.map((pkg) => ({
        id: pkg.id,
        name: String(pkg.name || ''),
        description: String(pkg.description || ''),
        session_count: Number(pkg.session_count || 1),
        price: Number(pkg.price || 0),
        active: Boolean(pkg.active),
      }));
      const preview = services
        .slice(0, 3)
        .map((s) => `${s.name} (₱${s.price})`)
        .join(', ');
      const hasError = !svcRes.ok;
      const summary = hasError
        ? `Services scan error: ${svcRes.error}`
        : services.length > 0
          ? `${services.length} services, ${categories.length} categories, ${packages.length} packages · ${preview}`
          : `0 services (${categories.length} categories, ${packages.length} packages)`;
      return {
        data: { services, categories, packages },
        count: services.length + packages.length,
        summary,
        hasError,
      };
    });
    servicesData = res.data;
    toolCalls.push(res.entry);
  } else if (key === 'calendar') {
    const res = await runScanner('tool_calendar', 'scan_calendar_bookings', 'Calendar, Bookings & Schedule', async () => {
      const [apptRes, blockRes, classRes, schedRes] = await Promise.all([
        safeQuery(
          `appointments?business_id=eq.${uid}&select=*&order=appointment_date.desc,appointment_time.asc&limit=60`
        ),
        safeQuery(
          `block_time_events?business_id=eq.${uid}&event_date=gte.${encodeURIComponent(
            todayManila
          )}&select=*&order=event_date.asc,start_time.asc&limit=30`
        ),
        safeQuery(
          `class_sessions?business_id=eq.${uid}&select=*&order=session_date.asc,start_time.asc&limit=25`
        ),
        safeQuery(`scheduling_settings?business_id=eq.${uid}&select=*&limit=1`),
      ]);
      const appointments = apptRes.rows.map((a) => ({
        id: a.id,
        customer_name: String(a.customer_name || ''),
        customer_phone: String(a.customer_phone || ''),
        customer_email: String(a.customer_email || ''),
        service_names: String(a.service_names || ''),
        appointment_date: String(a.appointment_date || ''),
        appointment_time: String(a.appointment_time || ''),
        duration_minutes: Number(a.duration_minutes || 60),
        total_price: a.final_total_amount ?? a.total_price ?? '0',
        status: String(a.status || 'pending'),
        staff_member_id: a.staff_member_id || null,
        customer_note: String(a.customer_note || ''),
      }));
      const blocks = blockRes.rows.map((b) => {
        const startTime = String(b.start_time || '09:00').slice(0, 5);
        const duration = Number(b.duration_minutes || 60);
        return {
          id: b.id,
          title: String(b.title || 'Blocked time'),
          event_date: String(b.event_date || ''),
          start_time: startTime,
          end_time: addMinutesToTime(startTime, duration),
          duration_minutes: duration,
          notes: String(b.notes || ''),
        };
      });
      const class_sessions = classRes.rows.map((c) => ({
        id: c.id,
        name: String(c.name || ''),
        session_date: String(c.session_date || ''),
        start_time: String(c.start_time || ''),
        duration_minutes: Number(c.duration_minutes || 60),
        capacity: Number(c.capacity || 0),
        enrolled_count: Number(c.enrolled_count || 0),
        status: String(c.status || 'scheduled'),
      }));
      const scheduling_settings = schedRes.rows[0] || {};
      const todayCount = appointments.filter(
        (a) => a.appointment_date === todayManila && !['cancelled', 'no_show'].includes(a.status)
      ).length;
      const hasError = !apptRes.ok;
      const summary = hasError
        ? `Bookings scan error: ${apptRes.error}`
        : `${appointments.length} bookings (${todayCount} today), ${blocks.length} upcoming blocks, ${class_sessions.length} classes`;
      return {
        data: { appointments, blocks, class_sessions, scheduling_settings },
        count: appointments.length + blocks.length + class_sessions.length,
        summary,
        hasError,
      };
    });
    calendarData = res.data;
    toolCalls.push(res.entry);
  } else if (key === 'clients') {
    const res = await runScanner('tool_clients', 'scan_clients_memberships', 'Clients & Memberships', async () => {
      const [clientRes, planRes, memRes] = await Promise.all([
        safeQuery(`clients?business_id=eq.${uid}&select=*&order=full_name.asc&limit=80`),
        safeQuery(`membership_plans?business_id=eq.${uid}&select=*&order=created_at.desc&limit=30`),
        safeQuery(`client_memberships?business_id=eq.${uid}&select=*&order=created_at.desc&limit=40`),
      ]);
      const clients = clientRes.rows.map((c) => ({
        id: c.id,
        full_name: String(c.full_name || ''),
        phone: String(c.phone || ''),
        email: String(c.email || ''),
        notes: String(c.notes || ''),
        tags: Array.isArray(c.tags) ? c.tags : [],
        blocked: Boolean(c.blocked),
      }));
      const membership_plans = planRes.rows.map((p) => ({
        id: p.id,
        name: String(p.name || ''),
        monthly_price: Number(p.monthly_price || 0),
        points_per_visit: Number(p.points_per_visit || 0),
        active: Boolean(p.active),
      }));
      const client_memberships = memRes.rows.map((m) => ({
        id: m.id,
        client_id: m.client_id,
        plan_id: m.plan_id,
        status: String(m.status || 'active'),
        points_balance: Number(m.points_balance || 0),
      }));
      const hasError = !clientRes.ok;
      const summary = hasError
        ? `Clients scan error: ${clientRes.error}`
        : `${clients.length} clients, ${membership_plans.length} membership plans, ${client_memberships.length} enrolled`;
      return {
        data: { clients, membership_plans, client_memberships },
        count: clients.length + membership_plans.length,
        summary,
        hasError,
      };
    });
    clientsData = res.data;
    toolCalls.push(res.entry);
  } else if (key === 'payments') {
    const res = await runScanner('tool_payments', 'scan_payments_revenue', 'Payments & Revenue', async () => {
      const payRes = await safeQuery(
        `payment_transactions?business_id=eq.${uid}&select=*&order=created_at.desc&limit=50`
      );
      const payments = payRes.rows.map((p) => ({
        id: p.id,
        client_name: String(p.client_name || ''),
        amount: Number(p.amount || 0),
        method: String(p.method || 'other'),
        status: String(p.status || 'pending'),
        transaction_type: String(p.transaction_type || 'payment'),
        created_at: String(p.created_at || ''),
      }));
      const monthPrefix = todayManila.slice(0, 7);
      const paidThisMonth = payments
        .filter(
          (p) =>
            p.status === 'paid' &&
            p.transaction_type !== 'refund' &&
            p.created_at.startsWith(monthPrefix)
        )
        .reduce((sum, p) => sum + p.amount, 0);
      const pendingCount = payments.filter((p) => p.status === 'pending').length;
      const hasError = !payRes.ok;
      const summary = hasError
        ? `Payments scan error: ${payRes.error}`
        : `₱${paidThisMonth.toLocaleString()} paid this month · ${payments.length} transactions (${pendingCount} pending)`;
      return {
        data: { payments, paidThisMonth, pendingCount },
        count: payments.length,
        summary,
        hasError,
      };
    });
    paymentsData = res.data;
    toolCalls.push(res.entry);
  } else if (key === 'staff') {
    const res = await runScanner('tool_staff', 'scan_staff_team', 'Team & Staff', async () => {
      const [staffRes, assignRes] = await Promise.all([
        safeQuery(`staff_members?business_id=eq.${uid}&select=*&order=created_at.asc&limit=40`),
        safeQuery(`staff_service_assignments?select=*&limit=100`),
      ]);
      const staffIds = new Set(staffRes.rows.map((s) => String(s.id)));
      const assignmentsByStaff = new Map<string, string[]>();
      for (const a of assignRes.rows) {
        const sid = String(a.staff_id || '');
        if (!staffIds.has(sid)) continue;
        const list = assignmentsByStaff.get(sid) || [];
        list.push(String(a.service_id || ''));
        assignmentsByStaff.set(sid, list);
      }
      const staff = staffRes.rows.map((s) => ({
        id: s.id,
        full_name: String(s.full_name || ''),
        role: String(s.role || 'staff'),
        status: String(s.status || 'active'),
        email: String(s.email || ''),
        phone: String(s.phone || ''),
        service_ids: assignmentsByStaff.get(String(s.id)) || [],
      }));
      const hasError = !staffRes.ok;
      const summary = hasError
        ? `Staff scan error: ${staffRes.error}`
        : staff.length > 0
          ? `${staff.length} team member(s): ${staff.slice(0, 3).map((m) => m.full_name).join(', ')}`
          : '0 team members configured';
      return { data: staff, count: staff.length, summary, hasError };
    });
    staffData = res.data;
    toolCalls.push(res.entry);
  } else if (key === 'automation') {
    const res = await runScanner('tool_automation', 'scan_notifications_integrations', 'Notifications, Reports & Integrations', async () => {
      const [notifSetRes, notifEvtRes, repSchedRes, intRes, whRes] = await Promise.all([
        safeQuery(`notification_settings?business_id=eq.${uid}&select=*&limit=1`),
        safeQuery(
          `notification_events?business_id=eq.${uid}&select=*&order=created_at.desc&limit=15`
        ),
        safeQuery(`report_schedules?business_id=eq.${uid}&select=*&limit=1`),
        safeQuery(`integration_connections?business_id=eq.${uid}&select=*&limit=20`),
        safeQuery(`integration_webhook_endpoints?business_id=eq.${uid}&select=*&limit=20`),
      ]);
      const notification_settings = notifSetRes.rows[0] || {};
      const recent_notifications = notifEvtRes.rows.map((n) => ({
        event_type: n.event_type,
        channel: n.channel,
        recipient: n.recipient,
        status: n.status,
        created_at: n.created_at,
      }));
      const report_schedule = repSchedRes.rows[0] || {};
      const integrations = intRes.rows.map((i) => ({
        provider: i.provider,
        status: i.status,
        external_account_label: i.external_account_label,
      }));
      const webhooks = whRes.rows.map((w) => ({
        name: w.name,
        active: Boolean(w.active),
        events: w.events,
      }));
      const summary = `${recent_notifications.length} notifications · ${integrations.length} integrations · ${webhooks.length} webhooks`;
      return {
        data: {
          notification_settings,
          recent_notifications,
          report_schedule,
          integrations,
          webhooks,
        },
        count: recent_notifications.length + integrations.length + webhooks.length,
        summary,
      };
    });
    automationData = res.data;
    toolCalls.push(res.entry);
  }
  }

  const appointments = (calendarData.appointments || []) as Array<Record<string, unknown>>;
  const todaysBookings = appointments.filter(
    (a) => a.appointment_date === todayManila && !['cancelled', 'no_show'].includes(String(a.status || ''))
  );
  const pendingBookingsCount = appointments.filter((a) => a.status === 'pending').length;

  const snapshot = {
    scanned_pages: selectedKeys,
    business: overviewData,
    summary: {
      today_date: todayManila,
      todays_active_bookings_count: todaysBookings.length,
      pending_bookings_count: pendingBookingsCount,
      paid_revenue_this_month_php: paymentsData.paidThisMonth || 0,
      pending_payments_count: paymentsData.pendingCount || 0,
      total_services: (servicesData.services || []).length,
      total_packages: (servicesData.packages || []).length,
      total_clients: (clientsData.clients || []).length,
      total_staff: staffData.length,
    },
    services: servicesData.services || [],
    service_categories: servicesData.categories || [],
    packages: servicesData.packages || [],
    appointments: appointments.slice(0, 45),
    upcoming_blocks: calendarData.blocks || [],
    class_sessions: calendarData.class_sessions || [],
    scheduling_settings: calendarData.scheduling_settings || {},
    clients: (clientsData.clients || []).slice(0, 60),
    membership_plans: clientsData.membership_plans || [],
    client_memberships: clientsData.client_memberships || [],
    recent_payments: (paymentsData.payments || []).slice(0, 20),
    staff: staffData || [],
    automation: automationData || {},
  };

  return { snapshot, toolCalls };
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
    const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
    const rawEnvModel = (Deno.env.get('OPENROUTER_MODEL') || DEFAULT_MODEL)
      .trim()
      .replace(/^['"]+|['"]+$/g, '');
    const configuredModel =
      !rawEnvModel || rawEnvModel === 'openrouter/free' ? DEFAULT_MODEL : rawEnvModel;

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
    const wantStream = body?.stream === true;
    const requestedModel = typeof body?.model === 'string' ? body.model.trim() : '';
    const isAllowedFreeModel =
      requestedModel !== 'openrouter/free' &&
      requestedModel.length > 5 &&
      requestedModel.endsWith(':free') &&
      !requestedModel.includes(' ');
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
    const selectedKeys = selectScannersForPrompt(messages);

    const runAssistantPipeline = async (
      emit?: (event: Record<string, unknown>) => void
    ): Promise<{ status: number; payload: Record<string, unknown> }> => {
      const { snapshot, toolCalls } = await scanOwnerPages(
        supabaseUrl,
        anonKey || serviceRoleKey,
        jwt,
        user.id,
        dateStr,
        selectedKeys,
        (ev) => emit?.(ev)
      );

      emit?.({ type: 'thinking_start', count: toolCalls.length, model: primaryModel });

      const systemPrompt = `You are Bookora AI, a concise, practical end-to-end business assistant built inside Bookora PH for local service business owners (salons, nail studios, clinics in the Philippines).
Current Manila date/time: ${weekday}, ${dateStr} ${timeStr} (Asia/Manila, currency PHP ₱).

You just queried the relevant Bookora workspace pages in real time (${selectedKeys.join(', ')}).

RULES:
1. Be concise, warm, mobile-friendly, and directly helpful in English or Taglish (match the user's language). Never mention "JSON", "snapshot", "prompt", or internal rules.
2. For metrics/questions/lookups (services, prices, durations, bookings, staff, clients, revenue, packages, memberships, hours, breaks, time off, settings), ONLY state exact facts found in LIVE WORKSPACE DATA below. Never claim services/clients don't exist without carefully checking LIVE WORKSPACE DATA. Never fabricate numbers or history.
3. For tasks the owner wants to do (book an appointment, update status, add services, add a client, add time off, block calendar time, or draft a message):
   - Match existing services (for price & duration_minutes), clients (for phone & email), staff, and settings from LIVE WORKSPACE DATA whenever present.
   - FIRST check LIVE WORKSPACE DATA for duplicates (e.g., a service with the same name, client with the same name/phone/email, booking at the exact same date & time for the same customer, or time off / block time with the same date & time/title). If it already exists, DO NOT emit a create action — simply inform the owner that it already exists and did not proceed.
   - Otherwise, ALWAYS write a short 1-2 sentence confirmation AND append <ACTION_JSON>...</ACTION_JSON> at the very end so the app shows a 1-tap Confirm button (fill missing customer phone/email with "" and unknown durations/prices with clean defaults like duration_minutes: 60, total_price: "0", status: "approved"). Never skip closing </ACTION_JSON>.
4. For DELETE requests (delete service, delete appointment/booking, delete client, delete time off, delete blocked time):
   - FIRST verify the exact matching item exists in LIVE WORKSPACE DATA and use its exact id and details. If it does not exist, clearly tell the owner it was not found and DO NOT emit a delete action.
   - NEVER claim it has already been deleted. Explicitly state what will be permanently deleted, ask the owner to confirm first, and append the delete <ACTION_JSON>...</ACTION_JSON>.
5. Keep any internal thinking brief (under 4 sentences) so your final answer and <ACTION_JSON> always finish cleanly. Never output reasoning or <ACTION_JSON> tags inside your visible reply text.

ALLOWED <ACTION_JSON> OBJECT FORMATS (single object or array):
- Create appointment:
  {"type":"create_appointment","label":"Book <customer> (<service>)","data":{"customer_name":"","customer_phone":"","customer_email":"","service_names":"","appointment_date":"YYYY-MM-DD","appointment_time":"HH:MM","duration_minutes":60,"total_price":"0","customer_note":"","status":"approved"}}
- Update booking status (use exact appointment id from data if found):
  {"type":"update_appointment_status","label":"Mark <customer> <status>","data":{"appointment_id":"","customer_name":"","appointment_date":"YYYY-MM-DD","new_status":"approved|completed|cancelled|no_show"}}
- Add services (great for menus pasted by owner):
  {"type":"create_service","label":"Add <N> service(s)","data":{"items":[{"name":"","price":350,"duration_minutes":45,"category":"","description":""}]}}
- Add client:
  {"type":"create_client","label":"Add client <name>","data":{"full_name":"","phone":"","email":"","notes":""}}
- Add time off (saved in Business Hours & Time Off settings):
  {"type":"add_time_off","label":"Add time off: <title> (<startDate>)","data":{"title":"","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","allDay":false,"repeat":"none|weekly|monthly"}}
- Block calendar time:
  {"type":"block_time","label":"Block <title>","data":{"title":"","event_date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","note":""}}
- Delete service (ALWAYS verify exists & ask confirmation; use exact service_id if found):
  {"type":"delete_service","label":"Delete service: <name>","data":{"service_id":"","name":""}}
- Delete appointment (ALWAYS verify exists & ask confirmation; use exact appointment_id if found):
  {"type":"delete_appointment","label":"Delete booking: <customer_name> (<appointment_date>)","data":{"appointment_id":"","customer_name":"","appointment_date":"YYYY-MM-DD","appointment_time":""}}
- Delete client (ALWAYS verify exists & ask confirmation; use exact client_id if found):
  {"type":"delete_client","label":"Delete client: <full_name>","data":{"client_id":"","full_name":""}}
- Delete time off (ALWAYS verify exists & ask confirmation; use exact time_off_id if found):
  {"type":"delete_time_off","label":"Delete time off: <title>","data":{"time_off_id":"","title":"","startDate":"YYYY-MM-DD"}}
- Delete block time (ALWAYS verify exists & ask confirmation; use exact block_id if found):
  {"type":"delete_block_time","label":"Delete blocked time: <title>","data":{"block_id":"","title":"","event_date":"YYYY-MM-DD","start_time":""}}
- Draft copyable customer/promo message:
  {"type":"draft_message","label":"Draft <channel> message","data":{"channel":"SMS|Messenger|Social","recipient":"","message":""}}

LIVE WORKSPACE DATA:
${JSON.stringify(snapshot)}`;

      const startedAt = Date.now();
      const usedModel = primaryModel;
      const useOpenRouterStream = Boolean(emit);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://www.bookoraph.com',
          'X-Title': 'Bookora PH Owner Assistant',
        },
        body: JSON.stringify({
          model: usedModel,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.35,
          max_tokens: 3200,
          stream: useOpenRouterStream,
        }),
      });

      let rawContent = '';
      let rawReasoning = '';
      let responseModel = usedModel;
      let completionErr: Record<string, unknown> | null = null;

      const resContentType = res.headers.get('content-type') || '';
      if (res.ok && useOpenRouterStream && resContentType.includes('text/event-stream') && res.body?.getReader) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let emittedThinkLen = 0;
        let emittedReplyLen = 0;
        let actionTagStarted = false;

        const computeLiveStreams = () => {
          // 1. Live thinking preview from delta.reasoning + <think>/<thought>/<reasoning> in rawContent
          let inlineThink = '';
          const withoutThink = rawContent.replace(
            /<(think|thought|reasoning)>([\s\S]*?)(?:<\/\1>|$)/gi,
            (_m, _tag, inner: string) => {
              if (inner) inlineThink += (inlineThink ? '\n' : '') + inner;
              return '';
            }
          );
          const unpairedMatch = withoutThink.match(/^([\s\S]*?)<\/(?:think|thought|reasoning)>([\s\S]*)$/i);
          const contentOutsideThink = unpairedMatch ? unpairedMatch[2] || '' : withoutThink;
          const combinedThink = [rawReasoning.trim(), inlineThink.trim()].filter(Boolean).join('\n\n');
          if (combinedThink.length > emittedThinkLen) {
            const deltaThink = combinedThink.slice(emittedThinkLen);
            emittedThinkLen = combinedThink.length;
            if (deltaThink) emit?.({ type: 'thinking_delta', text: deltaThink });
          }

          // 2. Live reply preview (halt cleanly before any <ACTION_JSON or trailing partial < tag)
          if (!actionTagStarted) {
            const actionIdx = contentOutsideThink.search(/<action_json/i);
            let safeReply =
              actionIdx >= 0 ? contentOutsideThink.slice(0, actionIdx) : contentOutsideThink;
            if (actionIdx >= 0) actionTagStarted = true;
            else safeReply = safeReply.replace(/<[a-z_]*$/i, '');
            safeReply = safeReply.replace(/^\s+/, '');
            if (
              safeReply.length > emittedReplyLen &&
              (emittedReplyLen > 0 || (safeReply.length >= 24 && !looksLikeLeakedThought(safeReply)))
            ) {
              const deltaReply = safeReply.slice(emittedReplyLen);
              emittedReplyLen = safeReply.length;
              if (deltaReply) emit?.({ type: 'content_delta', text: deltaReply });
            }
          }
        };

        const processSseLine = (rawLine: string) => {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) return;
          const payloadStr = line.slice(5).trim();
          if (!payloadStr || payloadStr === '[DONE]') return;
          try {
            const chunk = JSON.parse(payloadStr) as Record<string, unknown>;
            if (chunk.model) responseModel = String(chunk.model);
            const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
            const delta = (choices[0] as Record<string, unknown> | undefined)?.delta as Record<string, unknown> | undefined;
            if (!delta) return;

            const rDirect =
              typeof delta.reasoning === 'string'
                ? delta.reasoning
                : typeof delta.reasoning_content === 'string'
                  ? delta.reasoning_content
                  : '';
            if (rDirect) rawReasoning += rDirect;
            if (Array.isArray(delta.reasoning_details)) {
              for (const part of delta.reasoning_details) {
                if (part && typeof part === 'object') {
                  const txt = (part as Record<string, unknown>).text || (part as Record<string, unknown>).summary;
                  if (typeof txt === 'string') rawReasoning += txt;
                }
              }
            }
            if (typeof delta.content === 'string' && delta.content) {
              rawContent += delta.content;
            }
            computeLiveStreams();
          } catch {
            // Ignore malformed SSE chunk
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() || '';
          for (const l of lines) processSseLine(l);
        }
        if (sseBuffer.trim()) processSseLine(sseBuffer);
      } else {
        const completion = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          completionErr = completion;
        } else {
          if (completion?.model) responseModel = String(completion.model);
          const choices = Array.isArray(completion?.choices) ? completion.choices : [];
          const msgObj = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
          rawContent = String(msgObj?.content || '');
          const rField = msgObj?.reasoning ?? msgObj?.reasoning_content;
          if (typeof rField === 'string') rawReasoning = rField;
          else if (Array.isArray(msgObj?.reasoning_details)) {
            rawReasoning = msgObj.reasoning_details
              .map((p) => (p && typeof p === 'object' ? String((p as Record<string, unknown>).text || (p as Record<string, unknown>).summary || '') : ''))
              .filter(Boolean)
              .join('\n\n');
          }
          if (rawReasoning.trim()) emit?.({ type: 'thinking_delta', text: rawReasoning.trim() });
        }
      }

      const thinkingSeconds = Math.max(0.1, Number(((Date.now() - startedAt) / 1000).toFixed(1)));

      if (!res.ok) {
        const errObj = completionErr?.error as Record<string, unknown> | undefined;
        const rawErr = String(errObj?.message || completionErr?.message || '');
        if (res.status === 401 || rawErr.toLowerCase().includes('user not found')) {
          return {
            status: 401,
            payload: {
              error:
                'OpenRouter rejected your API key (401: User not found). Generate/copy a valid key from openrouter.ai/keys (starts with sk-or-v1-, no extra quotes) and save it as OPENROUTER_API_KEY in Supabase Edge Function Secrets.',
              configured: false,
            },
          };
        }
        const errMsg =
          rawErr ||
          (res.status === 429
            ? 'Free AI model rate limit reached for now. Please wait a minute or pick another model from the dropdown.'
            : 'Unable to reach OpenRouter AI right now.');
        return {
          status: res.status === 429 ? 429 : 502,
          payload: { error: errMsg, configured: true, tool_calls: toolCalls },
        };
      }

      const parsed = extractThinkingAndReply(rawContent.trim(), rawReasoning.trim() || null, null);
      if (!parsed.cleanContent) {
        return {
          status: 502,
          payload: {
            error:
              'The selected model spent all tokens thinking without producing a final reply. Please send again or try another model.',
            configured: true,
            tool_calls: toolCalls,
          },
        };
      }

      const { reply, actions } = extractActionsFromText(parsed.cleanContent);
      const cleanThinking = parsed.thinking
        ? parsed.thinking
            .replace(/<ACTION_JSON>[\s\S]*?(?:<\/ACTION_JSON>|$)/gi, '')
            .replace(/<\/?ACTION_JSON[^>]*>/gi, '')
            .trim() || null
        : null;

      return {
        status: 200,
        payload: {
          ok: true,
          configured: true,
          model: responseModel,
          reply,
          thinking: cleanThinking,
          thinking_seconds: thinkingSeconds,
          tool_calls: toolCalls,
          actions,
        },
      };
    };

    if (!wantStream) {
      const { status, payload } = await runAssistantPipeline();
      return jsonResponse(payload, status);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const pushLine = (obj: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
          } catch {
            // Stream closed by client abort
          }
        };
        try {
          const { status, payload } = await runAssistantPipeline((ev) => pushLine(ev));
          if (status >= 400 || payload.error) {
            pushLine({
              type: 'error',
              status,
              error: String(payload.error || 'Request failed'),
              configured: payload.configured !== false,
              tool_calls: Array.isArray(payload.tool_calls) ? payload.tool_calls : [],
            });
          } else {
            pushLine({ type: 'result', data: payload });
          }
        } catch (err) {
          pushLine({
            type: 'error',
            status: 500,
            error: err instanceof Error ? err.message : 'Unexpected assistant error',
            configured: true,
          });
        } finally {
          try {
            controller.close();
          } catch {
            // Ignore close errors
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected assistant error', configured: true },
      500
    );
  }
});

