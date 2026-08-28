import { getIcon } from '@/lib/icons'
import type { Category } from '@/types'

export function CategoryIcon({
  category,
  size = 'md',
}: {
  category: Category
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = getIcon(category.icon)
  const box =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg'
      : size === 'lg'
        ? 'h-14 w-14 rounded-2xl'
        : 'h-10 w-10 rounded-xl'
  const iconSize = size === 'lg' ? 24 : size === 'sm' ? 16 : 18
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${box}`}
      style={{ backgroundColor: `${category.color}1a`, color: category.color }}
    >
      <Icon size={iconSize} />
    </div>
  )
}
