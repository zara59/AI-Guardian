import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const FALLBACK = {
  allocation: 100,
  riskPreference: 'moderate',
  walletAddress: null,
};

/** Loads and saves user preferences through the backend. */
export function usePreferences() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [preferences, setPreferences] = useState(FALLBACK);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getPreferences();
      setPreferences({
        allocation: Number(data?.allocation ?? FALLBACK.allocation),
        riskPreference: data?.riskPreference || FALLBACK.riskPreference,
        walletAddress: data?.walletAddress || null,
      });
    } catch (err) {
      setError(err.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const save = useCallback(async (patch) => {
    setSaving(true);
    setError(null);
    try {
      const data = await api.savePreferences(patch);
      setPreferences({
        allocation: Number(data?.allocation ?? preferences.allocation ?? FALLBACK.allocation),
        riskPreference: data?.riskPreference || preferences.riskPreference || FALLBACK.riskPreference,
        walletAddress: data?.walletAddress ?? preferences.walletAddress,
      });
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save preferences');
      return false;
    } finally {
      setSaving(false);
    }
  }, [preferences]);

  return { preferences, loading, saving, error, reload: load, save };
}