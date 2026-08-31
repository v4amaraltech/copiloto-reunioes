import { useEffect, useState } from 'react'
import { UserProfile, setUserInfo } from './api'

// Painel local-only: não há login — sempre opera como o usuário local padrão.
const defaultLocalUser: UserProfile = {
  uid: 'default_user',
  display_name: 'Default User',
  email: 'contact@pickle.com',
};

export const useAuth = () => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setUser(defaultLocalUser)
    setUserInfo(defaultLocalUser)
    setIsLoading(false)
  }, [])

  return { user, isLoading, mode: 'local' as const }
}

export const useRedirectIfNotAuth = () => {
  const { user } = useAuth()
  return user
}
