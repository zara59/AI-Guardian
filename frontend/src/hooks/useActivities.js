import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { mapActivity } from '../services/mapping';

/** Loads the live activity feed from the backend. */
export function useActivities(limit = 50) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await api.getActivities(limit);
      setItems((result?.items || []).map(mapActivity));
    } catch (err) {
      setError(err.message || 'Failed to load activity');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load(true);
  }, [load]);

  return { items, loading, error, reload: load };
}