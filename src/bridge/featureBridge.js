// src/bridge/featureBridge.js
const { ipcMain, app, BrowserWindow } = require('electron');
const settingsService = require('../features/settings/settingsService');
const authService = require('../features/common/services/authService');
const whisperService = require('../features/common/services/whisperService');
const ollamaService = require('../features/common/services/ollamaService');
const modelStateService = require('../features/common/services/modelStateService');
const shortcutsService = require('../features/shortcuts/shortcutsService');
const presetRepository = require('../features/common/repositories/preset');
const searchRepository = require('../features/common/repositories/search');
const sessionRepository = require('../features/common/repositories/session');
const sttRepository = require('../features/listen/stt/repositories');
const localAIManager = require('../features/common/services/localAIManager');
const askService = require('../features/ask/askService');
const listenService = require('../features/listen/listenService');
const permissionService = require('../features/common/services/permissionService');
const encryptionService = require('../features/common/services/encryptionService');

module.exports = {
  // Renderer로부터의 요청을 수신하고 서비스로 전달
  initialize() {
    // Settings Service
    ipcMain.handle('settings:getPresets', async () => await settingsService.getPresets());
    ipcMain.handle('settings:setActivePreset', async (event, id) => await settingsService.setActivePreset(id));
    ipcMain.handle('settings:createPreset', async (event, { title, prompt }) => await settingsService.createPreset(title, prompt));
    ipcMain.handle('settings:updatePreset', async (event, { id, title, prompt }) => await settingsService.updatePreset(id, title, prompt));
    ipcMain.handle('settings:deletePreset', async (event, id) => await settingsService.deletePreset(id));
    ipcMain.handle('settings:get-auto-update', async () => await settingsService.getAutoUpdateSetting());
    ipcMain.handle('settings:set-auto-update', async (event, isEnabled) => await settingsService.setAutoUpdateSetting(isEnabled));  
    ipcMain.handle('settings:get-model-settings', async () => await settingsService.getModelSettings());
    ipcMain.handle('settings:clear-api-key', async (e, { provider }) => await settingsService.clearApiKey(provider));
    ipcMain.handle('settings:set-selected-model', async (e, { type, modelId }) => await settingsService.setSelectedModel(type, modelId));    

    ipcMain.handle('settings:get-ollama-status', async () => await settingsService.getOllamaStatus());
    ipcMain.handle('settings:ensure-ollama-ready', async () => await settingsService.ensureOllamaReady());
    ipcMain.handle('settings:shutdown-ollama', async () => await settingsService.shutdownOllama());

    // Shortcuts
    ipcMain.handle('settings:getCurrentShortcuts', async () => await shortcutsService.loadKeybinds());
    ipcMain.handle('shortcut:getDefaultShortcuts', async () => await shortcutsService.handleRestoreDefaults());
    ipcMain.handle('shortcut:closeShortcutSettingsWindow', async () => await shortcutsService.closeShortcutSettingsWindow());
    ipcMain.handle('shortcut:openShortcutSettingsWindow', async () => await shortcutsService.openShortcutSettingsWindow());
    ipcMain.handle('shortcut:saveShortcuts', async (event, newKeybinds) => await shortcutsService.handleSaveShortcuts(newKeybinds));
    ipcMain.handle('shortcut:toggleAllWindowsVisibility', async () => await shortcutsService.toggleAllWindowsVisibility());

    // Permissions
    ipcMain.handle('check-system-permissions', async () => await permissionService.checkSystemPermissions());
    ipcMain.handle('request-microphone-permission', async () => await permissionService.requestMicrophonePermission());
    ipcMain.handle('open-system-preferences', async (event, section) => await permissionService.openSystemPreferences(section));
    ipcMain.handle('mark-keychain-completed', async () => await permissionService.markKeychainCompleted());
    // Handler ausente no upstream: o renderer consulta se o setup de permissões já foi
    // concluído antes; responder com o estado real evita o erro "No handler registered".
    // Reinicia o app — necessário após liberar Gravação de Tela (o macOS só
    // reporta a permissão nova na próxima abertura do processo).
    ipcMain.handle('relaunch-app', () => {
        app.relaunch();
        app.exit(0);
    });
    ipcMain.handle('check-permissions-completed', async () => {
        const p = await permissionService.checkSystemPermissions();
        return !p.needsSetup;
    });
    ipcMain.handle('check-keychain-completed', async () => await permissionService.checkKeychainCompleted());
    ipcMain.handle('initialize-encryption-key', async () => {
        const userId = authService.getCurrentUserId();
        await encryptionService.initializeKey(userId);
        return { success: true };
    });

    // User/Auth
    ipcMain.handle('get-current-user', () => authService.getCurrentUser());

    // App
    ipcMain.handle('quit-application', () => app.quit());

    // Whisper
    ipcMain.handle('whisper:download-model', async (event, modelId) => await whisperService.handleDownloadModel(modelId));
    ipcMain.handle('whisper:get-installed-models', async () => await whisperService.handleGetInstalledModels());
       
    // General
    ipcMain.handle('get-preset-templates', () => presetRepository.getPresetTemplates());
    ipcMain.handle('get-web-url', () => process.env.pickleglass_WEB_URL || 'http://localhost:3000');

    // Ollama
    ipcMain.handle('ollama:get-status', async () => await ollamaService.handleGetStatus());
    ipcMain.handle('ollama:install', async () => await ollamaService.handleInstall());
    ipcMain.handle('ollama:start-service', async () => await ollamaService.handleStartService());
    ipcMain.handle('ollama:ensure-ready', async () => await ollamaService.handleEnsureReady());
    ipcMain.handle('ollama:get-models', async () => await ollamaService.handleGetModels());
    ipcMain.handle('ollama:get-model-suggestions', async () => await ollamaService.handleGetModelSuggestions());
    ipcMain.handle('ollama:pull-model', async (event, modelName) => await ollamaService.handlePullModel(modelName));
    ipcMain.handle('ollama:is-model-installed', async (event, modelName) => await ollamaService.handleIsModelInstalled(modelName));
    ipcMain.handle('ollama:warm-up-model', async (event, modelName) => await ollamaService.handleWarmUpModel(modelName));
    ipcMain.handle('ollama:auto-warm-up', async () => await ollamaService.handleAutoWarmUp());
    ipcMain.handle('ollama:get-warm-up-status', async () => await ollamaService.handleGetWarmUpStatus());
    ipcMain.handle('ollama:shutdown', async (event, force = false) => await ollamaService.handleShutdown(force));

    // Ask
    ipcMain.handle('ask:sendQuestionFromAsk', async (event, userPrompt) => await askService.sendMessage(userPrompt, listenService.getConversationHistory()));
    ipcMain.handle('ask:sendQuestionFromSummary', async (event, userPrompt) => await askService.sendMessage(userPrompt, listenService.getConversationHistory()));
    ipcMain.handle('ask:toggleAskButton', async () => await askService.toggleAskButton());
    ipcMain.handle('ask:closeAskWindow',  async () => await askService.closeAskWindow());
    
    // Listen
    ipcMain.handle('listen:sendMicAudio', async (event, { data, mimeType }) => await listenService.handleSendMicAudioContent(data, mimeType));
    ipcMain.handle('listen:sendSystemAudio', async (event, { data, mimeType }) => {
        const result = await listenService.sttService.sendSystemAudioContent(data, mimeType);
        if(result.success) {
            listenService.sendToRenderer('system-audio-data', { data });
        }
        return result;
    });
    ipcMain.handle('listen:startMacosSystemAudio', async () => await listenService.handleStartMacosAudio());
    ipcMain.handle('listen:stopMacosSystemAudio', async () => await listenService.handleStopMacosAudio());
    ipcMain.handle('update-google-search-setting', async (event, enabled) => await listenService.handleUpdateGoogleSearchSetting(enabled));
    ipcMain.handle('listen:isSessionActive', async () => await listenService.isSessionActive());

    // Sessions — busca por conteúdo da transcrição e por título.
    // A UI de busca (janela flutuante / painel) consome via window.api.sessions.search().
    ipcMain.handle('sessions:search', async (event, { query, limit } = {}) => {
      try {
        const results = await searchRepository.search(query, limit);
        return { success: true, results };
      } catch (error) {
        console.error('[FeatureBridge] sessions:search failed:', error);
        return { success: false, error: error.message, results: [] };
      }
    });

    // Lista das reuniões gravadas (aba 'Reuniões' das configurações).
    ipcMain.handle('sessions:list', async () => {
      try {
        const todas = await sessionRepository.getAllByUserId();
        // Só as calls gravadas: sessões de 'ask' não são reuniões.
        const sessions = (todas || []).filter(s => !s.session_type || s.session_type === 'listen');
        return { success: true, sessions };
      } catch (error) {
        console.error('[FeatureBridge] sessions:list failed:', error);
        return { success: false, error: error.message, sessions: [] };
      }
    });

    // Transcrição completa de uma reunião, em ordem cronológica.
    ipcMain.handle('sessions:transcripts', async (event, { sessionId } = {}) => {
      try {
        const transcripts = await sttRepository.getAllTranscriptsBySessionId(sessionId);
        return { success: true, transcripts: transcripts || [] };
      } catch (error) {
        console.error('[FeatureBridge] sessions:transcripts failed:', error);
        return { success: false, error: error.message, transcripts: [] };
      }
    });

    // Conversa com uma reunião passada (fatia 2): a resposta chega em streaming
    // pelo canal 'sessions:ask-stream', sempre acompanhada do sessionId.
    ipcMain.handle('sessions:ask', async (event, { sessionId, question } = {}) =>
      await askService.askAboutSession({ sessionId, question }));
    ipcMain.handle('sessions:aiMessages', async (event, { sessionId } = {}) => {
      try {
        const messages = await askService.getSessionAiMessages(sessionId);
        return { success: true, messages };
      } catch (error) {
        console.error('[FeatureBridge] sessions:aiMessages failed:', error);
        return { success: false, error: error.message, messages: [] };
      }
    });
    ipcMain.handle('sessions:stopAsk', async (event, { sessionId } = {}) =>
      askService.stopSessionAnswer(sessionId));

    // Times / empresa (docs/TIMES.md): o gestor vê as reuniões dos closers dele.
    const v4TeamService = require('../features/common/services/v4TeamService');
    ipcMain.handle('teams:get', async () => await v4TeamService.getMyTeam());
    ipcMain.handle('teams:create', async (event, { name } = {}) => await v4TeamService.createTeam(name));
    ipcMain.handle('teams:invite', async (event, { email, role } = {}) => await v4TeamService.invite(email, role));
    ipcMain.handle('teams:removeMember', async (event, { membershipId } = {}) =>
      await v4TeamService.removeMember(membershipId));
    ipcMain.handle('teams:leave', async () => await v4TeamService.leave());
    ipcMain.handle('teams:sessions', async (event, { limit } = {}) => await v4TeamService.teamSessions({ limit }));
    ipcMain.handle('teams:transcripts', async (event, { sessionId } = {}) =>
      await v4TeamService.teamTranscripts(sessionId));
    // Conversa com uma reunião do time: reaproveita o canal 'sessions:ask-stream',
    // só que lendo a transcrição da nuvem e gravando na sessão do closer.
    ipcMain.handle('teams:ask', async (event, { sessionId, question } = {}) =>
      await askService.askAboutSession({ sessionId, question, source: 'cloud' }));
    ipcMain.handle('teams:aiMessages', async (event, { sessionId } = {}) => {
      try {
        const messages = await askService.getSessionAiMessages(sessionId, 'cloud');
        return { success: true, messages };
      } catch (error) {
        console.error('[FeatureBridge] teams:aiMessages failed:', error);
        return { success: false, error: error.message, messages: [] };
      }
    });

    // V4 Auth (Appwrite) - jornada de conta dos closers
    const v4AuthService = require('../features/common/services/v4AuthService');
    ipcMain.handle('v4auth:login', async (event, { email, password }) => await v4AuthService.login(email, password));
    ipcMain.handle('v4auth:logout', async () => {
      const result = await v4AuthService.logout();
      // Sem conta, a flutuante volta para a jornada (criar conta / entrar).
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) win.webContents.send('force-show-account-header', { screen: 'welcome' });
      });
      return result;
    });
    ipcMain.handle('v4auth:getState', async () => await v4AuthService.getState());
    ipcMain.handle('v4auth:showAccountScreen', (event, { screen } = {}) => {
      const target = screen === 'login' ? 'login' : 'signup';
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) win.webContents.send('force-show-account-header', { screen: target });
      });
      return { success: true };
    });
    ipcMain.handle('v4auth:createAccount', async (event, { email, name, password }) => await v4AuthService.createAccount(email, name, password));
    ipcMain.handle('v4auth:sendVerification', async () => await v4AuthService.sendVerification());
    ipcMain.handle('v4auth:sendRecovery', async (event, { email }) => await v4AuthService.sendRecovery(email));
    ipcMain.handle('v4auth:completeRecovery', async (event, { userId, secret, newPassword }) => await v4AuthService.completeRecovery(userId, secret, newPassword));
    ipcMain.handle('listen:changeSession', async (event, listenButtonText) => {
      console.log('[FeatureBridge] listen:changeSession from mainheader', listenButtonText);
      try {
        await listenService.handleListenRequest(listenButtonText);
        return { success: true };
      } catch (error) {
        console.error('[FeatureBridge] listen:changeSession failed', error.message);
        return { success: false, error: error.message };
      }
    });

    // ModelStateService
    ipcMain.handle('model:validate-key', async (e, { provider, key }) => await modelStateService.handleValidateKey(provider, key));
    ipcMain.handle('model:get-all-keys', async () => await modelStateService.getAllApiKeys());
    ipcMain.handle('model:set-api-key', async (e, { provider, key }) => await modelStateService.setApiKey(provider, key));
    ipcMain.handle('model:remove-api-key', async (e, provider) => await modelStateService.handleRemoveApiKey(provider));
    ipcMain.handle('model:get-selected-models', async () => await modelStateService.getSelectedModels());
    ipcMain.handle('model:set-selected-model', async (e, { type, modelId }) => await modelStateService.handleSetSelectedModel(type, modelId));
    ipcMain.handle('model:get-available-models', async (e, { type }) => await modelStateService.getAvailableModels(type));
    ipcMain.handle('model:are-providers-configured', async () => await modelStateService.areProvidersConfigured());
    ipcMain.handle('model:get-provider-config', () => modelStateService.getProviderConfig());
    ipcMain.handle('model:re-initialize-state', async () => await modelStateService.initialize());

    // LocalAIManager 이벤트를 모든 윈도우에 브로드캐스트
    localAIManager.on('install-progress', (service, data) => {
      const event = { service, ...data };
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('localai:install-progress', event);
        }
      });
    });
    localAIManager.on('installation-complete', (service) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('localai:installation-complete', { service });
        }
      });
    });
    localAIManager.on('error', (error) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('localai:error-occurred', error);
        }
      });
    });
    // Handle error-occurred events from LocalAIManager's error handling
    localAIManager.on('error-occurred', (error) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('localai:error-occurred', error);
        }
      });
    });
    localAIManager.on('model-ready', (data) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('localai:model-ready', data);
        }
      });
    });
    localAIManager.on('state-changed', (service, state) => {
      const event = { service, ...state };
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('localai:service-status-changed', event);
        }
      });
    });

    // 주기적 상태 동기화 시작
    localAIManager.startPeriodicSync();

    // ModelStateService 이벤트를 모든 윈도우에 브로드캐스트
    modelStateService.on('state-updated', (state) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('model-state:updated', state);
        }
      });
    });
    modelStateService.on('settings-updated', () => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('settings-updated');
        }
      });
    });
    modelStateService.on('force-show-apikey-header', () => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('force-show-apikey-header');
        }
      });
    });

    // LocalAI 통합 핸들러 추가
    ipcMain.handle('localai:install', async (event, { service, options }) => {
      return await localAIManager.installService(service, options);
    });
    ipcMain.handle('localai:get-status', async (event, service) => {
      return await localAIManager.getServiceStatus(service);
    });
    ipcMain.handle('localai:start-service', async (event, service) => {
      return await localAIManager.startService(service);
    });
    ipcMain.handle('localai:stop-service', async (event, service) => {
      return await localAIManager.stopService(service);
    });
    ipcMain.handle('localai:install-model', async (event, { service, modelId, options }) => {
      return await localAIManager.installModel(service, modelId, options);
    });
    ipcMain.handle('localai:get-installed-models', async (event, service) => {
      return await localAIManager.getInstalledModels(service);
    });
    ipcMain.handle('localai:run-diagnostics', async (event, service) => {
      return await localAIManager.runDiagnostics(service);
    });
    ipcMain.handle('localai:repair-service', async (event, service) => {
      return await localAIManager.repairService(service);
    });
    
    // 에러 처리 핸들러
    ipcMain.handle('localai:handle-error', async (event, { service, errorType, details }) => {
      return await localAIManager.handleError(service, errorType, details);
    });
    
    // 전체 상태 조회
    ipcMain.handle('localai:get-all-states', async (event) => {
      return await localAIManager.getAllServiceStates();
    });

    console.log('[FeatureBridge] Initialized with all feature handlers.');
  },

  // Renderer로 상태를 전송
  sendAskProgress(win, progress) {
    win.webContents.send('feature:ask:progress', progress);
  },
};