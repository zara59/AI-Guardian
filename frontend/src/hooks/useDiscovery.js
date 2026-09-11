import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { mapDiscovery } from '../services/mapping';

/** Loads the on-chain discovery state (registry cursors + web→web3 screening queue). */
export function useDiscovery() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const raw = await api.getDiscovery();
      setData(mapDiscovery(raw));
    } catch (err) {
      setError(err.message || 'Failed to load discovery data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  return { data, loading, error, reload: load };
}