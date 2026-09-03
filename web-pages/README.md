# Páginas de e-mail (recuperação, verificação e convite)

HTML estático autocontido — sem build, sem dependência externa, sem CDN.
São o destino dos links que o Appwrite envia por e-mail.

| Página | URL esperada pelo app |
|---|---|
| `recuperar-senha/index.html` | `https://conta.v4companyamaral.com/recuperar-senha` |
| `verificar-email/index.html` | `https://conta.v4companyamaral.com/verificar-email` |
| `convite/index.html` | `https://conta.v4companyamaral.com/convite` |

Os caminhos vêm de `RECOVERY_URL` / `VERIFICATION_URL` em
`src/features/common/services/v4AuthService.js` e de `CONVITE_URL` em
`src/features/common/services/v4TeamService.js`, sobrescrevíveis pelas env
`V4_RECOVERY_URL`, `V4_VERIFICATION_URL` e `V4_INVITE_URL`.

## Como servir

Cada página é um `index.html` dentro de uma pasta com o nome da rota, então
basta servir `web-pages/` como raiz estática.

**Onde está hoje:** container `copiloto-conta` (nginx) no `vps-cerebro`, em
`~/copiloto-conta/` (`compose.yml` + `nginx.conf` + `www/`), atrás do Traefik
do Coolify com TLS Let's Encrypt. O nginx usa `try_files $uri/index.html $uri`
para servir `/verificar-email` sem redirect (um 301 para `/verificar-email/`
funcionaria, mas é uma ida a mais no clique do e-mail). O DNS `conta` é um
CNAME para `appwrite.v4companyamaral.com` na Cloudflare.

Para atualizar as páginas: `scp -r web-pages/* vps-cerebro:~/copiloto-conta/www/`.
Se mudar o `nginx.conf`, recrie o container (`docker compose up -d --force-recreate`)
— o bind de arquivo único não enxerga o `sed -i`.

## Duas coisas para não esquecer

1. **Host precisa estar liberado no Appwrite.** O `url` do e-mail é validado
   contra as plataformas registradas no projeto. As páginas vivem em
   `conta.v4companyamaral.com`, registrado como plataforma **Web** no console
   (Overview → Platforms). Sem isso o `createRecovery` devolve 400 e o `fetch`
   da página é bloqueado por CORS. (Cuidado: `localhost` e `127.0.0.1` contam
   como hosts diferentes.)
2. **Configuração no topo de cada arquivo.** `APPWRITE_ENDPOINT` e
   `APPWRITE_PROJECT_ID` estão como constantes no `<script>`. O project id é
   público (vai no header de toda requisição do cliente) — não é segredo.

## Página de convite

Recebe `?teamId=&membershipId=&userId=&secret=` e confirma a adesão com
`PATCH /v1/teams/{teamId}/memberships/{membershipId}/status`. É rota **pública**:
o par `userId`+`secret` do e-mail é a credencial — não há sessão nem API key
(uma API key aqui devolve 401 `general_unauthorized_scope`, medido).

Depois de confirmar, mostra "Você entrou no time X" com dois botões:
`Abrir o Copiloto` (deep link `pickleglass://team-joined`, que o app trata
recarregando o time) e `Criar minha senha`, para quem foi convidado por e-mail e
ainda não tinha conta — dispara `POST /v1/account/recovery` apontando de volta
para `/recuperar-senha`, reaproveitando o fluxo que já existia.

Modelo de papéis e permissões: `docs/TIMES.md`.

## Rota de verificação

A página de verificação chama `PUT /account/verification` (**singular**). O
servidor roda Appwrite 1.7.4; a rota plural `/account/verifications` só existe
a partir do 1.9.x e devolve 404 aqui.
