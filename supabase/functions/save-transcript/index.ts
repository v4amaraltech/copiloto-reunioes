// Copiloto de Reuniões V4 Amaral — recebe a transcrição completa de uma call
// ao final da sessão e persiste em copiloto_call_sessions/copiloto_call_transcripts.
//
// Idempotente: reenvios (retry de rede) fazem upsert da sessão pelo par
// (user_id, local_session_id) e substituem os turnos — sem duplicar.
//
// Auth: JWT do Supabase Auth em `Authorization: Bearer <jwt>` + allowlist.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { error: "missing_token" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData?.user) return json(401, { error: "invalid_token" });
  const userId = userData.user.id;

  const { data: appUser } = await admin
    .from("copiloto_app_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (!appUser || !appUser.active) return json(403, { error: "not_allowlisted" });

  let payload: {
    local_session_id?: string;
    lead_id?: string;
    lead_briefing?: string;
    started_at?: string;
    ended_at?: string;
    transcripts?: Array<{ seq: number; speaker: string; text: string; spoken_at?: string }>;
  };
  try {
    payload = await req.json();
  } catch (_) {
    return json(400, { error: "invalid_body" });
  }

  const { local_session_id, transcripts } = payload;
  if (!local_session_id || !Array.isArray(transcripts)) {
    return json(400, { error: "local_session_id e transcripts são obrigatórios" });
  }
  if (transcripts.length > 5000) {
    return json(400, { error: "transcripts_too_large" });
  }

  // Upsert da sessão (idempotente)
  const { data: sessionRow, error: sessionError } = await admin
    .from("copiloto_call_sessions")
    .upsert(
      {
        user_id: userId,
        local_session_id,
        lead_id: payload.lead_id ?? null,
        lead_briefing: payload.lead_briefing ?? null,
        started_at: payload.started_at ?? null,
        ended_at: payload.ended_at ?? null,
      },
      { onConflict: "user_id,local_session_id" },
    )
    .select("id")
    .single();

  if (sessionError || !sessionRow) {
    console.error("[save-transcript] session upsert failed:", sessionError?.message);
    return json(500, { error: "session_upsert_failed" });
  }

  // Substitui os turnos (retry-safe)
  await admin.from("copiloto_call_transcripts").delete().eq("call_session_id", sessionRow.id);

  if (transcripts.length > 0) {
    const rows = transcripts.map(t => ({
      call_session_id: sessionRow.id,
      seq: t.seq,
      speaker: (t.speaker || "").slice(0, 20),
      text: t.text || "",
      spoken_at: t.spoken_at ?? null,
    }));
    const { error: insertError } = await admin.from("copiloto_call_transcripts").insert(rows);
    if (insertError) {
      console.error("[save-transcript] transcripts insert failed:", insertError.message);
      return json(500, { error: "transcripts_insert_failed" });
    }
  }

  return json(200, { success: true, call_session_id: sessionRow.id, turns: transcripts.length });
});
