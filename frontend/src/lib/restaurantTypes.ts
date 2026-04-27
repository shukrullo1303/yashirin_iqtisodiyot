export type CafeUserRole = 'admin' | 'manager' | 'waiter' | 'chef'

export type MenuCategory = 'appetizer' | 'main' | 'dessert' | 'drink'

export interface CafeUser {
  id: string
  name: string
  email: string
  role: CafeUserRole
  password: string
  createdAt: Date
  passwordChangedAt?: Date
}

export interface CafeMenuItem {
  id: string
  name: string
  description: string
  price: number
  category: MenuCategory
  available: boolean
  image?: string
}

export interface CafeOrderItem {
  id: string
  menuItemId: string
  quantity: number
  notes?: string
  itemName?: string
  itemPrice?: number
}

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served'

export interface CafeOrder {
  id: string
  tableNumber: number
  items: CafeOrderItem[]
  status: OrderStatus
  createdAt: Date
  completedAt?: Date
  notes?: string
}

export interface CafeTable {
  id: string
  number: number
  capacity: number
}
