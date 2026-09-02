const sqliteRepository = require('./sqlite.repository');

let authService = null;

function setAuthService(service) {
    authService = service;
}

function getBaseRepository() {
    return sqliteRepository;
}

// Mesma camada de adaptação dos demais repositories: injeta o uid do usuário atual.
const searchRepositoryAdapter = {
    setAuthService,

    search: (query, limit) => {
        const uid = authService
            ? authService.getCurrentUserId()
            : require('../../services/authService').getCurrentUserId();
        return getBaseRepository().search(uid, query, limit);
    },

    // Exposto para testes e para quem já tem o uid em mãos.
    searchForUser: (uid, query, limit) => getBaseRepository().search(uid, query, limit),
};

module.exports = searchRepositoryAdapter;
