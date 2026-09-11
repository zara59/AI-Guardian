import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { mapGuardianStatus } from '../services/mapping';

/** Loads live Guardian protection status from the backend. */
export function useGuardianStatus() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getGuardianStatus();
      setStatus(mapGuardianStatus(data));
    } catch (err) {
      setError(err.message || 'Failed to load protection status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  return { status, loading, error, reload: load };
}