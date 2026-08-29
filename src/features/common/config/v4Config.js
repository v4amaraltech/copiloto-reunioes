// Configuração da infraestrutura V4 Amaral (Supabase Enriquece AI).
// A anon key é pública por design (protegida por RLS/edge functions).
// Env vars sobrescrevem os defaults para ambientes de teste.

const V4_SUPABASE_URL = process.env.V4_SUPABASE_URL || 'https://dhkmonctyoaenejemkrt.supabase.co';

const V4_SUPABASE_ANON_KEY =
    process.env.V4_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa21vbmN0eW9hZW5lamVta3J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjI3MDQsImV4cCI6MjA3MjczODcwNH0.auu515d8lTo1aWYHYPYGR6ICol_D-skRX7yclHZHY4g';

const V4_LLM_PROXY_URL = process.env.V4_LLM_PROXY_URL || `${V4_SUPABASE_URL}/functions/v1/proxy-llm`;

// Placeholder salvo em provider_settings quando o LLM roda via proxy —
// a credencial real é o JWT do closer, obtido em tempo de chamada.
const V4_PROXY_KEY_PLACEHOLDER = 'v4-proxy';

module.exports = {
    V4_SUPABASE_URL,
    V4_SUPABASE_ANON_KEY,
    V4_LLM_PROXY_URL,
    V4_PROXY_KEY_PLACEHOLDER,
};
