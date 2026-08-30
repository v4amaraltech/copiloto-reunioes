const { profilePrompts } = require('./promptTemplates.js');

function buildSystemPrompt(promptParts, customPrompt = '', googleSearchEnabled = true) {
    const sections = [promptParts.intro, '\n\n', promptParts.formatRequirements];

    if (googleSearchEnabled) {
        sections.push('\n\n', promptParts.searchUsage);
    }

    sections.push('\n\n', promptParts.content, '\n\nUser-provided context\n-----\n', customPrompt, '\n-----\n\n', promptParts.outputInstructions);

    return sections.join('');
}

function getSystemPrompt(profile, customPrompt = '', googleSearchEnabled = true, agentPrompt = '') {
    const baseParts = profilePrompts[profile] || profilePrompts.interview;
    // Agente ativo (criado pelo usuário em /personalize): o prompt dele substitui o
    // playbook (seção "content") do perfil base. Intro, regras de formato e instruções
    // de saída continuam fixas — o agente define O QUE orientar, não o formato.
    const promptParts = agentPrompt
        ? { ...baseParts, content: `PLAYBOOK DO AGENTE ATIVO (definido pelo usuário — siga como orientação principal desta call):\n${agentPrompt}` }
        : baseParts;
    return buildSystemPrompt(promptParts, customPrompt, googleSearchEnabled);
}

module.exports = {
    getSystemPrompt,
};
