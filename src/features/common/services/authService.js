// Modo local apenas: o login em nuvem (Firebase/Pickle) foi removido neste fork.
// A autenticação dos closers será feita via Supabase Auth (ver docs/plano-copiloto-reunioes.md).
const { BrowserWindow } = require('electron');
const encryptionService = require('./encryptionService');
const sessionRepository = require('../repositories/session');

class AuthService {
    constructor() {
        this.currentUserId = 'default_user';
        this.currentUserMode = 'local'; // 'local' or 'firebase'
        this.currentUser = null;
        this.isInitialized = false;

        // This ensures the key is ready before any login/logout state change.
        this.initializationPromise = null;

        sessionRepository.setAuthService(this);
    }

    initialize() {
        if (this.isInitialized) return this.initializationPromise;

        this.initializationPromise = (async () => {
            this.currentUser = null;
            this.currentUserId = 'default_user';
            this.currentUserMode = 'local';

            // Clean up any zombie sessions from a previous run.
            await sessionRepository.endAllActiveSessions();
            encryptionService.resetSessionKey();

            this.broadcastUserState();
            this.isInitialized = true;
            console.log('[AuthService] Initialized in local-only mode.');
        })();

        return this.initializationPromise;
    }

    async startFirebaseAuthFlow() {
        console.warn('[AuthService] Cloud login is disabled in this fork (local-only mode).');
        return { success: false, error: 'Cloud login is disabled in this fork.' };
    }

    async signInWithCustomToken() {
        throw new Error('Cloud login is disabled in this fork (local-only mode).');
    }

    async signOut() {
        try {
            await sessionRepository.endAllActiveSessions();
            this.broadcastUserState();
        } catch (error) {
            console.error('[AuthService] Error signing out:', error);
        }
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
        const isLoggedIn = !!(this.currentUserMode === 'firebase' && this.currentUser);

        if (isLoggedIn) {
            return {
                uid: this.currentUser.uid,
                email: this.currentUser.email,
                displayName: this.currentUser.displayName,
                mode: 'firebase',
                isLoggedIn: true,
                //////// before_modelStateService ////////
                // hasApiKey: this.hasApiKey // Always true for firebase users, but good practice
                //////// before_modelStateService ////////
            };
        }
        return {
            uid: this.currentUserId, // returns 'default_user'
            email: 'local@v4amaral.internal',
            displayName: 'Default User',
            mode: 'local',
            isLoggedIn: false,
            //////// before_modelStateService ////////
            // hasApiKey: this.hasApiKey
            //////// before_modelStateService ////////
        };
    }
}

const authService = new AuthService();
module.exports = authService; 