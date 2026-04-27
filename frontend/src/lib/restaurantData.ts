import { CafeUser, CafeMenuItem, CafeTable, CafeOrder } from './restaurantTypes'

export const initialCafeUsers: CafeUser[] = [
  { id: '1', name: 'Admin User', email: 'admin@cafe.uz', role: 'admin', password: '1234', createdAt: new Date() },
  { id: '2', name: 'Jahon Manager', email: 'manager@cafe.uz', role: 'manager', password: '1234', createdAt: new Date() },
  { id: '3', name: 'Ali Ofitsiant', email: 'waiter1@cafe.uz', role: 'waiter', password: '1234', createdAt: new Date() },
  { id: '4', name: 'Nazim Ofitsiant', email: 'waiter2@cafe.uz', role: 'waiter', password: '1234', createdAt: new Date() },
  { id: '5', name: 'Abdulla Oshpaz', email: 'chef@cafe.uz', role: 'chef', password: '1234', createdAt: new Date() },
]

export const initialCafeMenu: CafeMenuItem[] = [
  { id: 'menu-1', name: 'Samsa', description: "Qoy go'shti bilan samsa", price: 8000, category: 'appetizer', available: true },
  { id: 'menu-2', name: 'Mantı', description: 'Buguni pishirilgan mantı', price: 12000, category: 'appetizer', available: true },
  { id: 'menu-3', name: 'Achichuk', description: 'Sabzavot bilan salat', price: 6000, category: 'appetizer', available: true },
  { id: 'menu-4', name: 'Palov', description: 'Qurilgan palov gushtli', price: 25000, category: 'main', available: true },
  { id: 'menu-5', name: 'Shashlik', description: "Qo'yi go'shti shashlik", price: 28000, category: 'main', available: true },
  { id: 'menu-6', name: 'Norin', description: 'Tandır tovuqi bilan norin', price: 22000, category: 'main', available: true },
  { id: 'menu-7', name: 'Dimlama', description: 'Sabzavot bilan dimlama', price: 20000, category: 'main', available: true },
  { id: 'menu-8', name: 'Manti (Asosiy)', description: "Tog'li mantı qaymoq bilan", price: 18000, category: 'main', available: true },
  { id: 'menu-9', name: 'Halva', description: 'Traditsion halva', price: 5000, category: 'dessert', available: true },
  { id: 'menu-10', name: 'Chak-chak', description: 'Tatar milliy deserti', price: 7000, category: 'dessert', available: true },
  { id: 'menu-11', name: 'Plov (Shirin)', description: 'Qand bilan plov', price: 6000, category: 'dessert', available: true },
  { id: 'menu-12', name: 'Qahva', description: 'Issiq qahva', price: 4000, category: 'drink', available: true },
  { id: 'menu-13', name: 'Choy', description: 'Green choy', price: 3000, category: 'drink', available: true },
  { id: 'menu-14', name: 'Sharbat', description: 'Yangi mevali sharbat', price: 5000, category: 'drink', available: true },
  { id: 'menu-15', name: 'Ayran', description: 'Soy ichimlik', price: 4000, category: 'drink', available: true },
]

export const initialCafeTables: CafeTable[] = [
  { id: 'table-1', number: 1, capacity: 2 },
  { id: 'table-2', number: 2, capacity: 4 },
  { id: 'table-3', number: 3, capacity: 4 },
  { id: 'table-4', number: 4, capacity: 6 },
  { id: 'table-5', number: 5, capacity: 2 },
  { id: 'table-6', number: 6, capacity: 4 },
]

export const initialCafeOrders: CafeOrder[] = []
