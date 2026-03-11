import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PanchayatProvider } from './context/PanchayatContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="w-5 h-5 border-2 border-gray-700 border-t-green-500 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <PanchayatProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={
              <PublicRoute><LoginPage /></PublicRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><DashboardPage /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            <Route path="/map" element={
              <ProtectedRoute><MapPage /></ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </PanchayatProvider>
    </AuthProvider>
  );
}
