/**
 * Tope de gasto mensual por defecto, en soles.
 * Es el "no quiero pasarme de esto" de todo el mes, aparte de los presupuestos
 * por categoría. Se puede cambiar desde Ajustes; 0 lo desactiva.
 */
export const DEFAULT_MONTHLY_BUDGET = 3500

/** Estado de un presupuesto. El icono acompaña al color: nunca color solo. */
export type BudgetState = {
  color: string
  text: string
  icon: 'alert' | 'check'
}

export function budgetState(pct: number, over: boolean): BudgetState {
  if (over) return { color: '#e34948', text: 'Te pasaste', icon: 'alert' }
  if (pct >= 1) return { color: '#eda100', text: 'Al límite', icon: 'alert' }
  if (pct >= 0.8) return { color: '#eda100', text: 'Casi al límite', icon: 'alert' }
  return { color: '#008300', text: 'En rango', icon: 'check' }
}
