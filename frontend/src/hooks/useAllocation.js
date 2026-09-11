import { useState, useCallback } from 'react';

export function useAllocation() {
  const [amount, setAmount] = useState(100);
  const [riskPreference, setRiskPreference] = useState("moderate");

  const handleAmountChange = useCallback((value) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setAmount(num);
    } else if (value === "") {
      setAmount(0);
    }
  }, []);

  const handleRiskChange = useCallback((pref) => {
    setRiskPreference(pref);
  }, []);

  return {
    amount,
    riskPreference,
    handleAmountChange,
    handleRiskChange
  };
}
