import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  
  useEffect(() => {
  const token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');
  
  if (token && savedUser) {
    try {
      // Verify token is not expired by checking its payload
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();
      
      if (isExpired) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      } else {
        setUser(JSON.parse(savedUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
    } catch (err) {
      // Malformed token
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    }
  } else {
    setUser(null);
  }
  
  setLoading(false);
}, []);

  const login = async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const canWrite = user?.role === 'panchayat';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canWrite }}>
      {children}
    </AuthContext.Provider>
  );
};
