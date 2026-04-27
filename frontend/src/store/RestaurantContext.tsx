import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { CafeUser, CafeMenuItem, CafeTable, CafeOrder, CafeOrderItem } from '../lib/restaurantTypes'
import { initialCafeUsers, initialCafeMenu, initialCafeTables, initialCafeOrders } from '../lib/restaurantData'

interface RestaurantContextType {
  users: CafeUser[]
  menu: CafeMenuItem[]
  tables: CafeTable[]
  orders: CafeOrder[]
  addOrder: (order: CafeOrder) => void
  updateOrder: (id: string, order: Partial<CafeOrder>) => void
  deleteOrder: (id: string) => void
  addMenuItem: (item: CafeMenuItem) => void
  updateMenuItem: (id: string, item: Partial<CafeMenuItem>) => void
  deleteMenuItem: (id: string) => void
  addUser: (user: CafeUser) => void
  updateUser: (id: string, user: Partial<CafeUser>) => void
  deleteUser: (id: string) => void
  addTable: (table: CafeTable) => void
  deleteTable: (id: string) => void
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined)

type Action =
  | { type: 'LOAD'; payload: { users: CafeUser[]; menu: CafeMenuItem[]; tables: CafeTable[]; orders: CafeOrder[] } }
  | { type: 'ADD_ORDER'; payload: CafeOrder }
  | { type: 'UPDATE_ORDER'; payload: { id: string; order: Partial<CafeOrder> } }
  | { type: 'DELETE_ORDER'; payload: string }
  | { type: 'ADD_MENU_ITEM'; payload: CafeMenuItem }
  | { type: 'UPDATE_MENU_ITEM'; payload: { id: string; item: Partial<CafeMenuItem> } }
  | { type: 'DELETE_MENU_ITEM'; payload: string }
  | { type: 'ADD_USER'; payload: CafeUser }
  | { type: 'UPDATE_USER'; payload: { id: string; user: Partial<CafeUser> } }
  | { type: 'DELETE_USER'; payload: string }
  | { type: 'ADD_TABLE'; payload: CafeTable }
  | { type: 'DELETE_TABLE'; payload: string }

interface State {
  users: CafeUser[]
  menu: CafeMenuItem[]
  tables: CafeTable[]
  orders: CafeOrder[]
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...state, ...action.payload }
    case 'ADD_ORDER':
      return { ...state, orders: [...state.orders, action.payload] }
    case 'UPDATE_ORDER':
      return { ...state, orders: state.orders.map(o => o.id === action.payload.id ? { ...o, ...action.payload.order } : o) }
    case 'DELETE_ORDER':
      return { ...state, orders: state.orders.filter(o => o.id !== action.payload) }
    case 'ADD_MENU_ITEM':
      return { ...state, menu: [...state.menu, action.payload] }
    case 'UPDATE_MENU_ITEM':
      return { ...state, menu: state.menu.map(m => m.id === action.payload.id ? { ...m, ...action.payload.item } : m) }
    case 'DELETE_MENU_ITEM':
      return { ...state, menu: state.menu.filter(m => m.id !== action.payload) }
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] }
    case 'UPDATE_USER':
      return { ...state, users: state.users.map(u => u.id === action.payload.id ? { ...u, ...action.payload.user } : u) }
    case 'DELETE_USER':
      return { ...state, users: state.users.filter(u => u.id !== action.payload) }
    case 'ADD_TABLE':
      return { ...state, tables: [...state.tables, action.payload] }
    case 'DELETE_TABLE':
      return { ...state, tables: state.tables.filter(t => t.id !== action.payload) }
    default:
      return state
  }
}

const STORAGE_KEY = 'cafe_restaurant_state'

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    users: initialCafeUsers,
    menu: initialCafeMenu,
    tables: initialCafeTables,
    orders: initialCafeOrders,
  })

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        dispatch({ type: 'LOAD', payload: parsed })
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const ctx: RestaurantContextType = {
    users: state.users,
    menu: state.menu,
    tables: state.tables,
    orders: state.orders,
    addOrder: (o) => dispatch({ type: 'ADD_ORDER', payload: o }),
    updateOrder: (id, o) => dispatch({ type: 'UPDATE_ORDER', payload: { id, order: o } }),
    deleteOrder: (id) => dispatch({ type: 'DELETE_ORDER', payload: id }),
    addMenuItem: (m) => dispatch({ type: 'ADD_MENU_ITEM', payload: m }),
    updateMenuItem: (id, m) => dispatch({ type: 'UPDATE_MENU_ITEM', payload: { id, item: m } }),
    deleteMenuItem: (id) => dispatch({ type: 'DELETE_MENU_ITEM', payload: id }),
    addUser: (u) => dispatch({ type: 'ADD_USER', payload: u }),
    updateUser: (id, u) => dispatch({ type: 'UPDATE_USER', payload: { id, user: u } }),
    deleteUser: (id) => dispatch({ type: 'DELETE_USER', payload: id }),
    addTable: (t) => dispatch({ type: 'ADD_TABLE', payload: t }),
    deleteTable: (id) => dispatch({ type: 'DELETE_TABLE', payload: id }),
  }

  return <RestaurantContext.Provider value={ctx}>{children}</RestaurantContext.Provider>
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext)
  if (!ctx) throw new Error('useRestaurant must be used within RestaurantProvider')
  return ctx
}
