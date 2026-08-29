// Copiloto de Reuniões V4 Amaral — proxy autenticado para a API da Anthropic.
//
// Fluxo: app Electron → esta function (JWT do closer) → api.anthropic.com (secret).
// A API key da Anthropic NUNCA sai daqui. Streaming SSE é repassado byte a byte.
//
// Auth customizada (verify_jwt desabilitado na plataforma): aceita o JWT do
// Supabase Auth em `Authorization: Bearer <jwt>` ou `x-api-key: <jwt>` — o SDK
// da Anthropic no app envia o token por um desses dois caminhos.
//
// Secrets necessários (supabase secrets set):
//   COPILOTO_ANTHROPIC_KEY  — API key da Anthropic
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.)

import { createClient } from "jsr:@supabase/supabase-js@2";

const RATE_LIMIT_PER_MINUTE = 60;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, anthropic-version, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // 1. Extrai o JWT do closer
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.headers.get("x-api-key") ?? "";

  if (!token) {
    return json(401, { error: "missing_token" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 2. Valida o JWT no Supabase Auth
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData?.user) {
    return json(401, { error: "invalid_token" });
  }
  const userId = userData.user.id;

  // 3. Allowlist de closers
  const { data: appUser } = await admin
    .from("copiloto_app_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .maybeSingle();

  if (!appUser || !appUser.active) {
    return json(403, { error: "not_allowlisted" });
  }

  // 4. Rate limit simples por closer
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("copiloto_proxy_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneMinuteAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return json(429, { error: "rate_limited" });
  }

  // 5. Registra uso (auditoria) — sem await bloqueante do corpo
  let model: string | undefined;
  let body: string;
  try {
    body = await req.text();
    model = JSON.parse(body)?.model;
  } catch (_) {
    return json(400, { error: "invalid_body" });
  }
  await admin.from("copiloto_proxy_usage").insert({ user_id: userId, model });

  const anthropicKey = Deno.env.get("COPILOTO_ANTHROPIC_KEY");
  if (!anthropicKey) {
    console.error("[proxy-llm] COPILOTO_ANTHROPIC_KEY secret is not set");
    return json(500, { error: "proxy_not_configured" });
  }

  // 6. Repassa para a Anthropic com a key do secret, streaming intacto
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": req.headers.get("anthropic-version") ??
        "2023-06-01",
    },
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ??
        "application/json",
      ...CORS_HEADERS,
    },
  });
});
