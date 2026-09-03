// Notarização na Apple após a assinatura (hook afterSign do electron-builder).
// Só roda quando as três variáveis de ambiente existem — sem elas o build segue
// ad-hoc como hoje, então dá para deixar o hook sempre configurado.
//
//   APPLE_ID                    e-mail da conta Apple Developer
//   APPLE_APP_SPECIFIC_PASSWORD senha de app gerada em appleid.apple.com
//   APPLE_TEAM_ID               Team ID (10 caracteres) da conta
//
// Veja docs/ASSINATURA-E-NOTARIZACAO.md para o passo a passo.
const path = require('path');

exports.default = async function notarizing(context) {
    if (context.electronPlatformName !== 'darwin') return;
    const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
    if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
        console.log('[notarize] Sem credenciais Apple no ambiente — pulando notarização (build ad-hoc).');
        return;
    }
    if (context.appOutDir.endsWith('-temp')) return; // builds intermediários do universal

    const { notarize } = require('@electron/notarize');
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log(`[notarize] Enviando para a Apple: ${appPath}`);
    await notarize({
        appPath,
        appleId: APPLE_ID,
        appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
        teamId: APPLE_TEAM_ID,
    });
    console.log('[notarize] Notarização concluída e grampeada (staple).');
};
