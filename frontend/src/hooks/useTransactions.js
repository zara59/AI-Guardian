import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/** Loads recent prepared/signed/confirmed Guardian transactions. */
export function useTransactions(limit = 20) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        setItems(await api.listTransactions(limit));
      } catch (err) {
        setError(err.message || 'Failed to load transactions');
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  return { items, loading, error, reload: load };
}

export default useTransactions;