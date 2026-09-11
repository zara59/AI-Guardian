import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { mapRankedResult, riskLabel } from '../services/mapping';

const DEFAULT_AMOUNT = 100;
const DEFAULT_RISK = 'moderate';

/**
 * Loads the deterministic personalized ranking from the backend. The
 * backend owns the score/rank calculation; this hook only adapts the result
 * for presentation and applies client-side risk filters on top.
 */
export function useOpportunities({ amount = DEFAULT_AMOUNT, riskPreference = DEFAULT_RISK } = {}) {
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await api.createRanking({ allocation: amount, riskPreference });
      const { items: rankedItems, meta: resultMeta, updatedAt } = mapRankedResult(result);
      setItems(rankedItems);
      setMeta(resultMeta);
      setUpdatedAt(updatedAt);
    } catch (err) {
      setError(err.message || 'Failed to load opportunities');
      setItems([]);
      setMeta(null);
      setUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, [amount, riskPreference]);

  useEffect(() => {
    load(true);
  }, [load]);

  const filteredOpportunities = useMemo(() => {
    let results = [...items];
    switch (filter) {
      case 'low':
        results = results.filter((o) => o.risk === 'Low');
        break;
      case 'medium':
        results = results.filter((o) => o.risk === 'Medium');
        break;
      case 'high-potential':
        results = results.filter((o) => Number.parseFloat(o.apy) >= 10);
        break;
      default:
        break;
    }
    return results;
  }, [items, filter]);

  const stats = useMemo(() => {
    const total = items.length;
    const highConfidence = items.filter((o) => o.score >= 80).length;
    const riskWeights = { Low: 1, Medium: 2, High: 3 };
    const avg =
      items.reduce((sum, o) => sum + (riskWeights[o.risk] || 0), 0) /
      (total || 1);
    const averageRisk = total === 0 ? '—' : avg < 1.5 ? 'Low' : avg < 2.5 ? 'Medium' : 'High';
    return { total, highConfidence, averageRisk };
  }, [items]);

  return {
    opportunities: filteredOpportunities,
    allOpportunities: items,
    filter,
    setFilter,
    loading,
    error,
    stats,
    meta,
    updatedAt,
    reload: load,
    setError,
    riskLabel,
  };
}