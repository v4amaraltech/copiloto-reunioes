// Assina o app ad-hoc após o empacotamento (antes de gerar o DMG/zip).
// Sem isso o app sai com a assinatura genérica "Electron" e o macOS 26 ignora
// a permissão de Gravação de Tela concedida (ciclo infinito de permissões).
// Quando houver Apple Developer ID, remover este hook e configurar `identity`.
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') return;
    // Não assinar os builds intermediários por arquitetura: assinaturas diferentes
    // quebram a fusão do binário universal. Só o app final é assinado.
    if (context.appOutDir.endsWith('-temp')) {
        console.log(`[adhoc-sign] Pulando build intermediário: ${context.appOutDir}`);
        return;
    }
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log(`[adhoc-sign] Assinando ad-hoc: ${appPath}`);
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    execSync(`codesign -dv "${appPath}" 2>&1 | grep Identifier`, { stdio: 'inherit', shell: '/bin/bash' });
};
