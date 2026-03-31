/// <reference types="vite/client" />

import axios from 'axios'

const RAW_API_URL = import.meta.env.VITE_API_URL || '/api'
const API_URL = RAW_API_URL.endsWith('/') ? RAW_API_URL : `${RAW_API_URL}/`

const getCookie = (name: string) => {
  if (typeof document === 'undefined') {
    return ''
  }

  const match = document.cookie.match(new RegExp(`(^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[2]) : ''
}

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: {
    Accept: 'application/json',
  },
})

let csrfPromise: Promise<void> | null = null

export const ensureCsrfToken = async () => {
  const existingToken = getCookie('csrftoken')
  if (existingToken) {
    return existingToken
  }

  if (!csrfPromise) {
    csrfPromise = apiClient
      .get('auth/csrf/')
      .then(() => undefined)
      .finally(() => {
        csrfPromise = null
      })
  }

  await csrfPromise
  return getCookie('csrftoken')
}

apiClient.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()

  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrfToken = await ensureCsrfToken()
    if (csrfToken) {
      config.headers = config.headers || {}
      config.headers['X-CSRFToken'] = csrfToken
    }
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-storage')
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
