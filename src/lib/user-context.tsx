'use client'

import { createContext, useContext } from 'react'

export type UserRole = 'admin' | 'operator'

export const UserContext = createContext<{ role: UserRole }>({ role: 'admin' })

export function useUserRole(): UserRole {
  return useContext(UserContext).role
}
