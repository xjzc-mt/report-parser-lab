export function buildOnlineValidationRunSettings({
  baseSettings = {},
  selectedIndicatorTypes = [],
  runtimeConfig = {},
  runId = ''
} = {}) {
  return {
    ...baseSettings,
    indicatorTypes: selectedIndicatorTypes,
    apiKey: runtimeConfig.apiKey,
    apiUrl: runtimeConfig.apiUrl,
    modelName: runtimeConfig.modelName,
    providerType: runtimeConfig.providerType,
    serverManaged: runtimeConfig.serverManaged,
    companyConnectionId: runtimeConfig.companyConnectionId,
    supportsPdfUpload: runtimeConfig.supportsPdfUpload,
    pageKey: runtimeConfig.pageKey,
    runId,
    requestOptions: runtimeConfig.requestOptions || {},
    maxRetries: runtimeConfig.maxRetries || baseSettings.maxRetries
  };
}
