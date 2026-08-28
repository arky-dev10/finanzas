import {
  Utensils,
  Bus,
  Home,
  Zap,
  HeartPulse,
  Gamepad2,
  ShoppingBag,
  MoreHorizontal,
  Wallet,
  Banknote,
  Coffee,
  Car,
  Phone,
  GraduationCap,
  Gift,
  PiggyBank,
  type LucideIcon,
} from 'lucide-react'

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  bus: Bus,
  home: Home,
  zap: Zap,
  'heart-pulse': HeartPulse,
  'gamepad-2': Gamepad2,
  'shopping-bag': ShoppingBag,
  'more-horizontal': MoreHorizontal,
  wallet: Wallet,
  banknote: Banknote,
  coffee: Coffee,
  car: Car,
  phone: Phone,
  'graduation-cap': GraduationCap,
  gift: Gift,
  'piggy-bank': PiggyBank,
}

export const ICON_NAMES = Object.keys(ICONS)

export function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? MoreHorizontal
}
