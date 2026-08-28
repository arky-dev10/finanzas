/*
 * No hay tope por defecto a propósito: el monto lo elige el usuario en la
 * pantalla de bienvenida, y se cambia después desde Ajustes. 0 = sin tope.
 */

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
