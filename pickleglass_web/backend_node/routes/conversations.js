const express = require('express');
const router = express.Router();
const { ipcRequest } = require('../ipcBridge');

router.get('/', async (req, res) => {
    try {
        const sessions = await ipcRequest(req, 'get-sessions');
        res.json(sessions);
    } catch (error) {
        console.error('Failed to get sessions via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});

router.post('/', async (req, res) => {
    try {
        const result = await ipcRequest(req, 'create-session', req.body);
        res.status(201).json({ ...result, message: 'Session created successfully' });
    } catch (error) {
        console.error('Failed to create session via IPC:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Busca por conteúdo da transcrição (FTS5) e por título da sessão.
// Precisa vir ANTES de '/:session_id', senão o Express trataria "search" como um id.
router.get('/search', async (req, res) => {
    const query = (req.query.q || '').toString().trim();
    if (!query) {
        return res.json({ query: '', results: [] });
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));

    try {
        const results = await ipcRequest(req, 'search-sessions', { query, limit });
        res.json({ query, results: results || [] });
    } catch (error) {
        console.error('Failed to search sessions via IPC:', error);
        res.status(500).json({ error: 'Failed to search sessions' });
    }
});

router.get('/:session_id', async (req, res) => {
    try {
        const details = await ipcRequest(req, 'get-session-details', req.params.session_id);
        if (!details) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(details);
    } catch (error) {
        console.error(`Failed to get session details via IPC for ${req.params.session_id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve session details' });
    }
});

router.delete('/:session_id', async (req, res) => {
    try {
        await ipcRequest(req, 'delete-session', req.params.session_id);
        res.status(200).json({ message: 'Session deleted successfully' });
    } catch (error) {
        console.error(`Failed to delete session via IPC for ${req.params.session_id}:`, error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

module.exports = router; 