/**
 * Colores de UI que no son del modelo de dominio (eso vive en
 * `lib/budget.ts`, el semáforo verde/ámbar/rojo) pero sí se repiten entre
 * componentes y tienen que verse igual en todos lados. Un solo lugar para
 * que nadie los reinvente con un hex ligeramente distinto.
 */

/**
 * Azul de devolución: ni el verde de ingreso (no es plata nueva) ni el tono
 * de gasto (no salió plata). Un movimiento con esta naturaleza tiene que
 * verse igual sea una fila de TransactionItem, un bloque de CategoryDetail
 * o una barra de CategoryMonthlyBars.
 */
export const DEVOLUCION = '#1f6c9f'
