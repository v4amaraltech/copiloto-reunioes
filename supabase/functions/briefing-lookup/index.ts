// Copiloto de Reuniões V4 Amaral — briefing automático da próxima reunião.
//
// Fluxo: app (JWT do closer) → esta function → webhook n8n (Google Calendar)
// → match dos convidados com leads do Enriquece AI → card de briefing pronto.
//
// Secrets necessários:
//   COPILOTO_N8N_SECRET — segredo compartilhado com o workflow n8n

import { createClient } from "jsr:@supabase/supabase-js@2";

const N8N_WEBHOOK_URL = "https://webhook-n8n.v4companyamaral.com/webhook/copiloto-briefing";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function moeda(v: number | null): string {
  if (!v) return "não informado";
  return `R$ ${Number(v).toLocaleString("pt-BR")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { error: "missing_token" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData?.user) return json(401, { error: "invalid_token" });

  const { data: appUser } = await admin
    .from("copiloto_app_users")
    .select("user_id, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!appUser || !appUser.active) return json(403, { error: "not_allowlisted" });

  const n8nSecret = Deno.env.get("COPILOTO_N8N_SECRET");
  if (!n8nSecret) {
    console.error("[briefing-lookup] COPILOTO_N8N_SECRET não configurado");
    return json(500, { error: "not_configured" });
  }

  // 1. Próxima reunião via n8n/Calendar
  const calResp = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-copiloto-secret": n8nSecret,
    },
    body: JSON.stringify({ closer_email: userData.user.email }),
  });

  if (!calResp.ok) {
    console.error("[briefing-lookup] n8n webhook falhou:", calResp.status);
    return json(502, { error: "calendar_unavailable" });
  }
  const event = await calResp.json();

  if (!event.found) {
    return json(200, { found: false, reason: event.reason || "sem reunião com convidado externo" });
  }

  // 2. Match dos convidados com leads
  const emails = (event.attendee_emails || []).map((e: string) => e.toLowerCase());
  const { data: matches, error: matchError } = await admin.rpc("copiloto_match_lead", {
    p_emails: emails,
  });
  if (matchError) {
    console.error("[briefing-lookup] match falhou:", matchError.message);
    return json(500, { error: "match_failed" });
  }

  const lead = Array.isArray(matches) && matches.length > 0 ? matches[0] : null;

  const eventInfo = {
    title: event.title,
    start: event.start,
    attendees: emails,
  };

  if (!lead) {
    return json(200, { found: true, matched: false, event: eventInfo });
  }

  // 3. Card de briefing (formato compacto para o system prompt)
  const nome = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "não identificado";
  const briefing = [
    `LEAD: ${nome}${lead.job_title ? ` (${lead.job_title})` : ""}`,
    `EMPRESA: ${lead.empresa || "não informada"}${lead.cnpj ? ` — CNPJ ${lead.cnpj}` : ""}`,
    `FATURAMENTO ESTIMADO: ${moeda(lead.faturamento_estimado)}`,
    `ORIGEM: ${lead.lead_source || "não informada"} | CANAL: ${lead.canal || "-"} | ${lead.is_inbound ? "INBOUND" : "OUTBOUND"}`,
    `CONTATO: ${lead.email || "-"} | ${lead.telefone || "-"}`,
    lead.notes ? `ANOTAÇÕES DO SDR: ${lead.notes}` : null,
    `REUNIÃO: ${event.title || "sem título"} — ${event.start || ""}`,
  ].filter(Boolean).join("\n");

  return json(200, {
    found: true,
    matched: true,
    event: eventInfo,
    lead_id: lead.lead_id,
    briefing,
  });
});
