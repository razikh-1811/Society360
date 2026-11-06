import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { TOKEN_KEY } from '../services/api';

const AuthContext = createContext(null);
export const HOME = { resident: '/resident', helpdesk: '/helpdesk', committee: '/committee' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { setReady(true); return; }
    api.get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setReady(true));
  }, []);

  const finish = ({ token, user: u }) => { localStorage.setItem(TOKEN_KEY, token); setUser(u); return u; };
  const login = useCallback(async (email, password) => finish((await api.post('/auth/login', { email, password })).data), []);
  const demoCommittee = useCallback(async () => finish((await api.post('/auth/demo-committee')).data), []);
  const logout = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setUser(null); }, []);

  return <AuthContext.Provider value={{ user, ready, login, demoCommittee, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
