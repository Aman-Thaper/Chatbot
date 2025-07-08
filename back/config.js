let BASE_URL = '';

// Set this once during server startup
export function setBaseUrl(hostname) {
  BASE_URL = hostname;
}

export function getBaseUrl() {
  return BASE_URL;
}