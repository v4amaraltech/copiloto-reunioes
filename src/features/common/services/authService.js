// Modo local apenas: o app roda sempre como default_user.
// A autenticação dos closers é feita via Supabase Auth (v4AuthService).
const { BrowserWindow } = require('electron');
const encryptionService = require('./encryptionService');
const sessionRepository = require('../repositories/session');

class AuthService {
    constructor() {
        this.currentUserId = 'default_user';
        this.isInitialized = false;

        // This ensures the key is ready before any login/logout state change.
        this.initializationPromise = null;

        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = (async () => {
            this.currentUserId = 'default_user';

            // Clean up any zombie sessions from a previous run.
            await sessionRepository.endAllActiveSessions();
            encryptionService.resetSessionKey();

            this.broadcastUserState();
            this.isInitialized = true;
            console.log('[AuthService] Initialized in local-only mode.');
        })();

        return this.initializationPromise;
    }

    broadcastUserState() {
        const userState = this.getCurrentUser();
        console.log('[AuthService] Broadcasting user state change:', userState);
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('user-state-changed', userState);
            }
        });
    }

    getCurrentUserId() {
        return this.currentUserId;
    }

    getCurrentUser() {
        return {
            uid: this.currentUserId, // returns 'default_user'
            email: 'local@v4amaral.internal',
            displayName: 'Default User',
            mode: 'local',
            isLoggedIn: false,
        };
    }
}

const authService = new AuthService();
module.exports = authService; 