# Assinatura com Developer ID e notarização

Hoje o Copiloto V4 sai com assinatura **ad-hoc**. Consequências para o cliente:
o macOS avisa "desenvolvedor não identificado" na primeira abertura, e as
permissões de tela/microfone se perdem a cada atualização (o sistema amarra a
permissão à assinatura, e a ad-hoc muda a cada build).

A infraestrutura de build já está pronta para o Developer ID: basta a conta
Apple e três variáveis de ambiente. Nenhuma mudança de código.

## 1. Conta Apple Developer (quem: Vinícius · custo: US$ 99/ano)

1. https://developer.apple.com/programs/enroll/ — inscrever como **organização**
   (V4 Company Amaral) ou pessoa física. Organização exige D-U-N-S; pessoa
   física sai no mesmo dia.
2. Depois de aprovada, anote o **Team ID** (Membership → Team ID, 10 caracteres).

## 2. Certificado "Developer ID Application" (no Mac que faz o build)

1. Xcode → Settings → Accounts → entrar com a conta → Manage Certificates →
   **+** → *Developer ID Application*. Ou pelo portal: Certificates → + →
   Developer ID Application, com um CSR do Acesso às Chaves.
2. Confirmar no terminal — tem que listar uma identidade:
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```

## 3. Senha de app para a notarização

https://appleid.apple.com → Sign-In and Security → App-Specific Passwords →
gerar uma chamada `copiloto-notarize`.

## 4. Variáveis de ambiente do build

```bash
export CSC_NAME="Developer ID Application: <nome como aparece no certificado> (<TEAMID>)"
export APPLE_ID="<e-mail da conta Apple>"
export APPLE_APP_SPECIFIC_PASSWORD="<senha de app do passo 3>"
export APPLE_TEAM_ID="<TEAMID>"
npm run build:signed
```

`npm run build:signed` passa `CSC_NAME` como identidade para o electron-builder
(o `npm run build` comum continua ad-hoc, por causa do `identity: null` no
`electron-builder.yml`). Com `CSC_NAME` definido, `scripts/adhoc-sign.js` se
desliga sozinho e o electron-builder assina com o certificado (hardened runtime e entitlements já
configurados em `electron-builder.yml`). Com as três `APPLE_*`,
`scripts/notarize.js` envia o app para a Apple e grampeia o ticket. A
notarização leva de 2 a 15 minutos.

Sem essas variáveis, o build continua exatamente como hoje (ad-hoc).

## 5. Conferir antes de publicar

```bash
spctl -a -vv "dist/mac-universal/Copiloto V4.app"   # esperado: accepted, source=Notarized Developer ID
codesign -dv --verify --strict "dist/mac-universal/Copiloto V4.app"
```

Depois disso a permissão de tela concedida uma vez vale para todas as
atualizações, e o link de download abre sem aviso.
