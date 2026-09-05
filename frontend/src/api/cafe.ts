import apiClient from './client'

// ── Menu ──────────────────────────────────────────────────────────────────────
export const menuApi = {
  categories: (locationId?: number) =>
    apiClient.get('cafe/menu-categories/', { params: locationId ? { location_id: locationId } : {} }),
  createCategory: (data: { location: number; name: string; order?: number }) =>
    apiClient.post('cafe/menu-categories/', data),
  updateCategory: (id: number, data: Partial<{ name: string; order: number; is_active: boolean }>) =>
    apiClient.patch(`cafe/menu-categories/${id}/`, data),
  deleteCategory: (id: number) => apiClient.delete(`cafe/menu-categories/${id}/`),

  items: (params?: { location_id?: number; category_id?: number }) =>
    apiClient.get('cafe/menu-items/', { params }),
  createItem: (data: FormData | Record<string, unknown>) =>
    apiClient.post('cafe/menu-items/', data),
  updateItem: (id: number, data: FormData | Record<string, unknown>) =>
    apiClient.patch(`cafe/menu-items/${id}/`, data),
  deleteItem: (id: number) => apiClient.delete(`cafe/menu-items/${id}/`),
}

// ── Tables ────────────────────────────────────────────────────────────────────
export const tableApi = {
  list: (locationId?: number) =>
    apiClient.get('cafe/tables/', { params: locationId ? { location_id: locationId } : {} }),
  create: (data: { location: number; room?: number | null; number?: number; name?: string; capacity?: number; position_x?: number; position_y?: number; shape?: string; width?: number; height?: number }) =>
    apiClient.post('cafe/tables/', data),
  update: (id: number, data: Partial<{ room: number | null; name: string; capacity: number; position_x: number; position_y: number; shape: string; width: number; height: number }>) => apiClient.patch(`cafe/tables/${id}/`, data),
  delete: (id: number) => apiClient.delete(`cafe/tables/${id}/`),
}

export const roomApi = {
  list: (locationId?: number) => apiClient.get('cafe/rooms/', { params: locationId ? { location_id: locationId } : {} }),
  create: (data: { location: number; name: string; width?: number; height?: number; position_x?: number; position_y?: number }) => apiClient.post('cafe/rooms/', data),
  update: (id: number, data: Partial<{ name: string; width: number; height: number; position_x: number; position_y: number }>) => apiClient.patch(`cafe/rooms/${id}/`, data),
  delete: (id: number) => apiClient.delete(`cafe/rooms/${id}/`),
}

// ── Orders ────────────────────────────────────────────────────────────────────
export const orderApi = {
  list: (params?: { location_id?: number; status?: string; order_type?: string }) =>
    apiClient.get('cafe/orders/', { params }),
  today: (locationId?: number) =>
    apiClient.get('cafe/orders/today/', { params: locationId ? { location_id: locationId } : {} }),
  create: (data: {
    table?: number
    order_type?: string
    customer_name?: string
    customer_phone?: string
    delivery_address?: string
    note?: string
  }) => apiClient.post('cafe/orders/', data),
  addItems: (orderId: number, items: Array<{ menu_item: number; quantity: number; note?: string }>) =>
    apiClient.post(`cafe/orders/${orderId}/add_items/`, { items }),
  updateStatus: (orderId: number, status: string) =>
    apiClient.post(`cafe/orders/${orderId}/update_status/`, { status }),
}

// ── Locations ─────────────────────────────────────────────────────────────────
export const locationApi = {
  list: () => apiClient.get('locations/'),
}

// ── Inventory ─────────────────────────────────────────────────────────────────
export const inventoryApi = {
  list: (locationId?: number) =>
    apiClient.get('cafe/inventory/', { params: locationId ? { location_id: locationId } : {} }),
  create: (data: { location: number; name: string; unit: string; quantity: number; min_quantity: number }) =>
    apiClient.post('cafe/inventory/', data),
  update: (id: number, data: Partial<{ name: string; unit: string; quantity: number; min_quantity: number }>) =>
    apiClient.patch(`cafe/inventory/${id}/`, data),
  delete: (id: number) => apiClient.delete(`cafe/inventory/${id}/`),
  adjust: (id: number, delta: number) => apiClient.post(`cafe/inventory/${id}/adjust/`, { delta }),
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  cafe: (params?: { days?: number; location_id?: number }) =>
    apiClient.get('cafe/analytics/', { params }),
}

// ── Staff ─────────────────────────────────────────────────────────────────────
export const staffApi = {
  list: () => apiClient.get('cafe/staff/'),
  create: (data: { username: string; full_name: string; role: string; password: string; is_active?: boolean }) =>
    apiClient.post('cafe/staff/', data),
  update: (id: number, data: Partial<{ full_name: string; role: string; is_active: boolean }>) =>
    apiClient.patch(`cafe/staff/${id}/`, data),
  delete: (id: number) => apiClient.delete(`cafe/staff/${id}/`),
  setPassword: (id: number, password: string) =>
    apiClient.post(`cafe/staff/${id}/set_password/`, { password }),
  toggleActive: (id: number) => apiClient.post(`cafe/staff/${id}/toggle_active/`),
}
