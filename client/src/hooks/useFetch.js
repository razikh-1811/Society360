import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/api';

// Loads data with loading/error state; reload() refetches without unmounting the UI.
export default function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const ref = useRef(fetcher);
  ref.current = fetcher;

  const load = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await ref.current();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ data: silent ? s.data : null, loading: false, error: errorMessage(err) }));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);
  return { ...state, reload: () => load(true), retry: () => load(false) };
}
