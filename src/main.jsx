import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import App from './App.jsx';
import { PlatformConfigProvider } from './components/PlatformConfigProvider.jsx';
import { appTheme } from './theme.js';
import './styles/global.css';
import './styles/admin.css';

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const isAdminPath = typeof window !== 'undefined'
  && (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Suspense fallback={<div className="app-loading">正在加载平台...</div>}>
        {isAdminPath ? (
          <AdminApp />
        ) : (
          <PlatformConfigProvider>
            <App />
          </PlatformConfigProvider>
        )}
      </Suspense>
    </MantineProvider>
  </React.StrictMode>
);
