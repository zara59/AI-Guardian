export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatScore(score, max = 100) {
  return `${score} / ${max}`;
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning, Guardian";
  if (hour < 17) return "Good afternoon, Guardian";
  return "Good evening, Guardian";
}

export function getRiskColor(risk) {
  switch (risk) {
    case "Low": return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
    case "Medium": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    case "High": return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
    default: return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
  }
}

export function getStatusConfig(status) {
  switch (status) {
    case "analyzed": return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
    case "approved": return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
    case "pending": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    case "completed": return { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" };
    default: return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
  }
}
