import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && import.meta.env.PROD) {
  console.warn(
    'VITE_API_URL is not defined in production. API calls will likely fail.'
  );
}

/**
 * Configured axios instance for API communication.
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL || 'http://localhost:3777',
  timeout: 15000, // Increased timeout for cold starts
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to attach the JWT token to headers.
 */
apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor to handle global 401 unauthorized errors.
 */
apiClient.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    // Skip global 401 redirect for auth endpoints so components can handle login/register errors
    const isAuthEndpoint =
      error.config?.url?.includes('/api/auth/login') ||
      error.config?.url?.includes('/api/auth/register');

    if (error.response?.status === 401 && !isAuthEndpoint) {
      // Clear authentication data
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Redirect to login page
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  },
);

export { apiClient };