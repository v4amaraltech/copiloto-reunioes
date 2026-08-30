'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Plus, Copy, Trash2, Zap, ZapOff } from 'lucide-react'
import { getPresets, updatePreset, createPreset, deletePreset, setActivePreset, PromptPreset } from '@/utils/api'

export default function PersonalizePage() {
  const [allPresets, setAllPresets] = useState<PromptPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
  const [showPresets, setShowPresets] = useState(true);
  const [editorContent, setEditorContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const presetsData = await getPresets();
        setAllPresets(presetsData);

        if (presetsData.length > 0) {
          const initial = presetsData.find(p => p.is_active === 1) || presetsData[0];
          setSelectedPreset(initial);
          setEditorContent(initial.prompt);
        }
      } catch (error) {
        console.error("Failed to fetch agents:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePresetClick = (preset: PromptPreset) => {
    if (isDirty && !window.confirm("Você tem alterações não salvas. Deseja trocar de agente mesmo assim?")) {
        return;
    }
    setSelectedPreset(preset);
    setEditorContent(preset.prompt);
    setIsDirty(false);
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditorContent(e.target.value);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedPreset || saving || !isDirty) return;

    if (selectedPreset.is_default === 1) {
        alert("Agentes padrão não podem ser editados. Use o botão Duplicar para criar uma cópia editável.");
        return;
    }

    try {
      setSaving(true);
      await updatePreset(selectedPreset.id, {
        title: selectedPreset.title,
        prompt: editorContent
      });

      setAllPresets(prev =>
        prev.map(p =>
          p.id === selectedPreset.id
            ? { ...p, prompt: editorContent }
            : p
          )
        );
      setIsDirty(false);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Não foi possível salvar o agente. Veja o console para detalhes.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivateToggle = async () => {
    if (!selectedPreset || saving) return;

    const isActive = selectedPreset.is_active === 1;
    const newActiveId = isActive ? null : selectedPreset.id;

    try {
      setSaving(true);
      await setActivePreset(newActiveId);
      setAllPresets(prev => prev.map(p => ({ ...p, is_active: p.id === newActiveId ? 1 : 0 })));
      setSelectedPreset(prev => prev ? { ...prev, is_active: prev.id === newActiveId ? 1 : 0 } : prev);
    } catch (error) {
      console.error("Failed to set active agent:", error);
      alert("Não foi possível ativar o agente. Veja o console para detalhes.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewPreset = async () => {
    const title = prompt("Nome do novo agente (ex.: Pré-venda — Ligação):");
    if (!title) return;

    const initialPrompt = "Descreva aqui como este agente deve orientar as sugestões durante a conversa...";

    try {
      setSaving(true);
      const { id } = await createPreset({
        title,
        prompt: initialPrompt
      });

      const newPreset: PromptPreset = {
        id,
        uid: 'current_user',
        title,
        prompt: initialPrompt,
        is_default: 0,
        is_active: 0,
        created_at: Date.now(),
        sync_state: 'clean'
      };

      setAllPresets(prev => [...prev, newPreset]);
      setSelectedPreset(newPreset);
      setEditorContent(newPreset.prompt);
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert("Não foi possível criar o agente. Veja o console para detalhes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicatePreset = async () => {
    if (!selectedPreset) return;

    const title = prompt("Nome do agente duplicado:", `${selectedPreset.title} (cópia)`);
    if (!title) return;

    try {
      setSaving(true);
      const { id } = await createPreset({
        title,
        prompt: editorContent
      });

      const newPreset: PromptPreset = {
        id,
        uid: 'current_user',
        title,
        prompt: editorContent,
        is_default: 0,
        is_active: 0,
        created_at: Date.now(),
        sync_state: 'clean'
      };

      setAllPresets(prev => [...prev, newPreset]);
      setSelectedPreset(newPreset);
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to duplicate agent:", error);
      alert("Não foi possível duplicar o agente. Veja o console para detalhes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPreset || saving) return;
    if (selectedPreset.is_default === 1) return;

    if (!window.confirm(`Excluir o agente "${selectedPreset.title}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    try {
      setSaving(true);
      const wasActive = selectedPreset.is_active === 1;
      await deletePreset(selectedPreset.id);
      if (wasActive) {
        await setActivePreset(null);
      }

      const remaining = allPresets.filter(p => p.id !== selectedPreset.id);
      setAllPresets(remaining);
      const next = remaining[0] || null;
      setSelectedPreset(next);
      setEditorContent(next ? next.prompt : '');
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to delete agent:", error);
      alert("Não foi possível excluir o agente. Veja o console para detalhes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const activeAgent = allPresets.find(p => p.is_active === 1) || null;

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100">
        <div className="px-8 pt-8 pb-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500 mb-2">
                {activeAgent
                  ? <>Agente ativo: <span className="font-medium text-green-700">{activeAgent.title}</span></>
                  : 'Nenhum agente ativo — as sugestões usam o playbook padrão (Closer)'}
              </p>
              <h1 className="text-3xl font-bold text-gray-900">Agentes</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateNewPreset}
                disabled={saving}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Novo agente
              </button>
              {selectedPreset && (
                <button
                  onClick={handleActivateToggle}
                  disabled={saving}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 ${
                    selectedPreset.is_active === 1
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {selectedPreset.is_active === 1 ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  {selectedPreset.is_active === 1 ? 'Desativar' : 'Ativar'}
                </button>
              )}
              {selectedPreset && (
                <button
                  onClick={handleDuplicatePreset}
                  disabled={saving}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Duplicar
                </button>
              )}
              {selectedPreset && selectedPreset.is_default === 0 && (
                <button
                  onClick={handleDeletePreset}
                  disabled={saving}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !isDirty || selectedPreset?.is_default === 1}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  !isDirty && !saving
                    ? 'bg-gray-500 text-white cursor-default'
                    : saving
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
              >
                {!isDirty && !saving ? 'Salvo' : saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`transition-colors duration-300 ${showPresets ? 'bg-gray-50' : 'bg-white'}`}>
        <div className="px-8 py-6">
          <div className="mb-6">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${showPresets ? 'rotate-180' : ''}`}
              />
              {showPresets ? 'Ocultar agentes' : 'Mostrar agentes'}
            </button>
          </div>

          {showPresets && (
            <div className="grid grid-cols-5 gap-4 mb-6">
              {allPresets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className={`
                    p-4 rounded-lg cursor-pointer transition-all duration-200 bg-white
                    h-48 flex flex-col shadow-sm hover:shadow-md relative
                    ${selectedPreset?.id === preset.id
                      ? 'border-2 border-blue-500 shadow-md'
                      : 'border border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="absolute top-2 right-2 flex gap-1">
                    {preset.is_active === 1 && (
                      <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
                        Ativo
                      </div>
                    )}
                    {preset.is_default === 1 && (
                      <div className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                        Padrão
                      </div>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-3 text-center text-sm mt-4">
                    {preset.title}
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed flex-1 overflow-hidden">
                    {preset.prompt.substring(0, 100) + (preset.prompt.length > 100 ? '...' : '')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white">
        <div className="h-full px-8 py-6 flex flex-col">
          {selectedPreset?.is_default === 1 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                <p className="text-sm text-yellow-800">
                  <strong>Este é um agente padrão e não pode ser editado.</strong>{' '}
                  Você pode ativá-lo como está, ou usar o botão "Duplicar" para criar uma cópia editável.
                </p>
              </div>
            </div>
          )}
          <textarea
            value={editorContent}
            onChange={handleEditorChange}
            className="w-full flex-1 text-sm text-gray-900 border-0 resize-none focus:outline-none bg-transparent font-mono leading-relaxed"
            placeholder="Selecione um agente ou digite o prompt diretamente..."
            readOnly={selectedPreset?.is_default === 1}
          />
        </div>
      </div>
    </div>
  );
}
