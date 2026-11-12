import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TEMPORARILY_DEFERRED_PAGE_KEYS } from '../constants/platformPages.js';

import { buildCompanyPresets, createEmptyPublicConfig, fetchPlatformConfig } from '../services/platformConfigService.js';
import { subscribePlatformConfigChanged } from '../utils/platformConfigBroadcast.js';

const PlatformConfigContext = createContext({
  config: null,
  configAvailable: false,
  loading: true,
  error: '',
  companyPresets: [],
  isPageEnabled: () => true,
  getPageDefaults: () => ({}),
  getPageConfig: () => null,
  refresh: async () => {}
});

export function PlatformConfigProvider({ children, fetchImpl }) {
  const [state, setState] = useState({
    config: null,
    loading: true,
    error: ''
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState((previous) => ({ ...previous, loading: true, error: '' }));
    fetchPlatformConfig({ fetchImpl, signal: controller.signal })
      .then((config) => {
        if (!active) return;
        setState({ config, loading: false, error: '' });
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return;
        setState({
          config: null,
          loading: false,
          error: error instanceof Error ? error.message : '平台配置读取失败。'
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fetchImpl, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return subscribePlatformConfigChanged(() => {
      refresh();
    }, window);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    let lastRefreshAt = 0;
    const maybeRefresh = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      const current = Date.now();
      if (current - lastRefreshAt < 1_000) {
        return;
      }
      lastRefreshAt = current;
      refresh();
    };
    window.addEventListener('focus', maybeRefresh);
    window.addEventListener('pageshow', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      window.removeEventListener('pageshow', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [refresh]);

  const companyPresets = useMemo(
    () => (state.config ? buildCompanyPresets(state.config) : []),
    [state.config]
  );

  const isPageEnabled = useCallback((pageKey) => {
    if (!state.config) {
      return !TEMPORARILY_DEFERRED_PAGE_KEYS.has(pageKey);
    }
    return state.config.pages?.[pageKey]?.enabled !== false;
  }, [state.config]);

  const getPageDefaults = useCallback((pageKey) => {
    return state.config?.pages?.[pageKey]?.defaults || {};
  }, [state.config]);

  const getPageConfig = useCallback((pageKey) => {
    return state.config?.pages?.[pageKey] || null;
  }, [state.config]);

  const value = useMemo(() => ({
    config: state.config || createEmptyPublicConfig(),
    configAvailable: Boolean(state.config),
    loading: state.loading,
    error: state.error,
    companyPresets,
    isPageEnabled,
    getPageDefaults,
    getPageConfig,
    refresh
  }), [companyPresets, getPageConfig, getPageDefaults, isPageEnabled, refresh, state.config, state.error, state.loading]);

  return (
    <PlatformConfigContext.Provider value={value}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}
