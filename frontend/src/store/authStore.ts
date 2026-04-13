import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import apiClient from '../api/client'

interface User {
  id: number
  username: string
  email: string
  full_name: string
  role: string
  is_active?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
  bootstrapAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      login: async (username: string, password: string) => {
        set({ isLoading: true })
        try {
          const response = await apiClient.post('auth/login/', { username, password })
          set({
            token: null,
            user: response.data.user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            token: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
          })
          throw error
        }
      },
      logout: () => {
        apiClient.post('auth/logout/').catch(() => undefined)
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      },
      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user, isLoading: false })
      },
      bootstrapAuth: async () => {
        set({ isLoading: true })
        try {
          const response = await apiClient.get('auth/me/')
          set({
            user: response.data,
            token: null,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },
    }),
    {
      name: 'auth-storage-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
)
