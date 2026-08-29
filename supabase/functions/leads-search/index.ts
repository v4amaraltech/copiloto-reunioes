// Copiloto de Reuniões V4 Amaral — busca manual de leads (fallback do briefing).
// O closer digita nome/empresa/e-mail; devolve até 10 leads com o card de
// briefing já montado, pronto para injetar no prompt.

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

  const results = (rows || []).map(lead => {
    const nome = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "sem nome";
    const empresa = lead.nome_fantasia || lead.razao_social || "empresa não informada";
    const briefing = [
      `LEAD: ${nome}${lead.job_title ? ` (${lead.job_title})` : ""}`,
      `EMPRESA: ${empresa}${lead.cnpj ? ` — CNPJ ${lead.cnpj}` : ""}`,
      `FATURAMENTO ESTIMADO: ${moeda(lead.faturamento_estimado)}`,
      `ORIGEM: ${lead.lead_source || "não informada"} | CANAL: ${lead.canal || "-"} | ${lead.is_inbound ? "INBOUND" : "OUTBOUND"}`,
      `CONTATO: ${lead.email || "-"} | ${lead.telefone || "-"}`,
      lead.notes ? `ANOTAÇÕES DO SDR: ${lead.notes}` : null,
    ].filter(Boolean).join("\n");

    return {
      lead_id: lead.id,
      label: `${nome} — ${empresa}`,
      briefing,
    };
  });

  return json(200, { results });
});
