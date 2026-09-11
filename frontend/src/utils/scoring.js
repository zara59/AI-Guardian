export function getScoreColor(score) {
  if (score >= 80) return "#16A34A";
  if (score >= 65) return "#F59E0B";
  if (score >= 45) return "#F97316";
  return "#DC2626";
}

export function getScoreLabel(score) {
  if (score >= 80) return "Strong Candidate";
  if (score >= 65) return "Worth Considering";
  if (score >= 45) return "High Caution";
  return "Avoid";
}

export function getScoreBg(score) {
  if (score >= 80) return "bg-green-50";
  if (score >= 65) return "bg-amber-50";
  if (score >= 45) return "bg-orange-50";
  return "bg-red-50";
}

export function getScoreTextClass(score) {
  if (score >= 80) return "text-green-600";
  if (score >= 65) return "text-amber-600";
  if (score >= 45) return "text-orange-600";
  return "text-red-600";
}

export function getTotalScore(breakdown) {
  return breakdown.security + breakdown.potential + breakdown.sustainability + breakdown.liquidity + breakdown.userFit;
}
