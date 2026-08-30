// Copiloto de Reuniões V4 Amaral — busca manual de leads (fallback do briefing).
// O closer digita nome/empresa/e-mail; devolve até 10 leads com o card de
// briefing BANT já montado, pronto para injetar no prompt.

import { createClient } from "jsr:@supabase/supabase-js@2";

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

function moeda(v: number | string | null): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return `R$ ${n.toLocaleString("pt-BR")}`;
}

function campo(q: Record<string, string> | null, nome: string, max = 700): string | null {
  const t = (q?.[nome] || "").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// Card de briefing BANT (mesmo formato do briefing-lookup)
// deno-lint-ignore no-explicit-any
function montarBriefing(lead: any): string {
  const q = (lead.qualificacao || {}) as Record<string, string>;
  const nome = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "sem nome";
  const empresa = lead.nome_fantasia || lead.razao_social || "empresa não informada";
  const disc = campo(q, "Perfil do Lead (DISC)", 120);

  const financeiro = [
    moeda(lead.faturamento_estimado) ? `faturamento estimado ${moeda(lead.faturamento_estimado)}` : null,
    campo(q, "Faturamento do último mês", 80) ? `último mês: ${campo(q, "Faturamento do último mês", 80)}` : null,
  ].filter(Boolean).join(" | ");

  const semInfo = "não preenchido — descobrir na call";
  return [
    `LEAD: ${nome}${lead.job_title ? ` (${lead.job_title})` : ""}${disc ? ` | Perfil DISC: ${disc}` : ""}`,
    `EMPRESA: ${empresa}${lead.segmento ? ` | Segmento: ${lead.segmento}` : ""}`,
    financeiro ? `FINANCEIRO: ${financeiro}` : null,
    `ORIGEM: ${lead.lead_source || "não informada"} | CANAL: ${lead.canal || "-"} | ${lead.is_inbound ? "INBOUND" : "OUTBOUND"}`,
    `QUALIFICAÇÃO DO SDR (BANT):`,
    `• Budget: ${campo(q, "B (Budget)") || semInfo}`,
    `• Autoridade: ${campo(q, "A (Autoridade)") || semInfo}`,
    `• Necessidade: ${campo(q, "N (Necessidade)") || semInfo}`,
    `• Timing: ${campo(q, "T (Timing)") || semInfo}`,
    campo(q, "Oportunidades") ? `OPORTUNIDADES: ${campo(q, "Oportunidades")}` : null,
    campo(q, "Observação Decisor") ? `OBSERVAÇÃO SOBRE O DECISOR: ${campo(q, "Observação Decisor")}` : null,
    campo(q, "Histórico Cliente") ? `HISTÓRICO DO CLIENTE: ${campo(q, "Histórico Cliente")}` : null,
    lead.notes ? `ANOTAÇÕES DO SDR: ${String(lead.notes).slice(0, 500)}` : null,
  ].filter(Boolean).join("\n");
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

  let query = "";
  try {
    const body = await req.json();
    query = (body.query || "").trim();
  } catch (_) { /* body vazio */ }

  if (query.length < 2) return json(400, { error: "query_too_short" });

  const pattern = `%${query}%`;
  const { data: rows, error: searchError } = await admin
    .from("leads")
    .select("id, first_name, last_name, job_title, nome_fantasia, razao_social, cnpj, email, telefone, faturamento_estimado, lead_source, canal, is_inbound, notes")
    .is("deleted_at", null)
    .or(`nome_fantasia.ilike.${pattern},razao_social.ilike.${pattern},email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .limit(10);

  if (searchError) {
    console.error("[leads-search] falhou:", searchError.message);
    return json(500, { error: "search_failed" });
  }

  // Qualificação BANT em lote
  const ids = (rows || []).map(l => l.id);
  const qualByLead = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data: quals, error: qualError } = await admin.rpc("copiloto_leads_qualificacao", {
      p_lead_ids: ids,
    });
    if (qualError) {
      console.error("[leads-search] qualificação falhou:", qualError.message);
    } else {
      for (const qr of quals || []) qualByLead.set(qr.lead_id, qr);
    }
  }

  const results = (rows || []).map(lead => {
    const extra = qualByLead.get(lead.id) || {};
    const nome = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "sem nome";
    const empresa = lead.nome_fantasia || lead.razao_social || "empresa não informada";
    return {
      lead_id: lead.id,
      label: `${nome} — ${empresa}`,
      briefing: montarBriefing({ ...lead, ...extra }),
    };
  });

  return json(200, { results });
});
