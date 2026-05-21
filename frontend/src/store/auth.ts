import { create } from 'zustand'

interface User {
  id: number
  username: string
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  initialized: boolean
  setAuth: (user: User, token: string) => void
  setInitialized: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  initialized: false,
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token, initialized: true })
  },
  setInitialized: () => set({ initialized: true }),
  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },
}))
