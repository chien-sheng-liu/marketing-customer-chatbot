import { useState, useEffect } from 'react';
import { fetchAgentSettings, saveAgentSettings, AgentSettings } from '../services/apiClient';

const SETTINGS_ID = 'global';

const DEFAULT_SETTINGS: AgentSettings = {
  brandName: '客服助手',
  greetingLine: '有什麼可以幫您的嗎？',
  escalateCopy: '您的需求需要專人協助，正在為您轉接，請稍候...',
  businessHours: '週一至週五 09:00-18:00',
  defaultTags: ['一般客服'],
};

interface UseSettingsReturn {
  settings: AgentSettings;
  isLoading: boolean;
  isSaving: boolean;
  isSaved: boolean;
  error: string | null;
  updateField: (field: keyof AgentSettings, value: string) => void;
  updateTags: (raw: string) => void;
  save: () => Promise<void>;
  tagsInput: string;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [tagsInput, setTagsInput] = useState(DEFAULT_SETTINGS.defaultTags.join(', '));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetchAgentSettings(SETTINGS_ID)
      .then((data) => {
        if (!active) return;
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        setTagsInput((merged.defaultTags ?? []).join(', '));
      })
      .catch(() => {
        if (!active) return;
        setSettings(DEFAULT_SETTINGS);
        setTagsInput(DEFAULT_SETTINGS.defaultTags.join(', '));
        setError('設定載入失敗，已套用預設值');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateField = (field: keyof AgentSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setIsSaved(false);
    setError(null);
  };

  const updateTags = (raw: string) => {
    setTagsInput(raw);
    const tags = raw.split(',').map((t) => t.trim()).filter(Boolean);
    setSettings((prev) => ({ ...prev, defaultTags: tags }));
    setIsSaved(false);
    setError(null);
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveAgentSettings(SETTINGS_ID, settings);
      setSettings(saved);
      setTagsInput((saved.defaultTags ?? []).join(', '));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  return { settings, isLoading, isSaving, isSaved, error, updateField, updateTags, save, tagsInput };
}
