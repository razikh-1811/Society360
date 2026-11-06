import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
export const TOKEN_KEY = 'society360_token';

const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Expired or invalid session: clear it and go to login (except for the login call itself).
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    }
    return Promise.reject(err);
  }
);

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (err.response?.data?.details?.length) return err.response.data.details.map((d) => d.message).join('. ');
  return err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'The request timed out.' : err.message === 'Network Error' ? 'Cannot reach the server.' : fallback);
};

// Uploaded images are served by the API origin.
export const fileUrl = (p) => {
  if (!p) return '';
  const origin = API_URL.startsWith('http') ? new URL(API_URL).origin : '';
  return `${origin}${p}`;
};

export default api;
