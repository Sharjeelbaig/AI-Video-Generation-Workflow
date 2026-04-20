import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useApp } from '../../store/AppContext';

export default function ToastProvider() {
  const { state, dispatch } = useApp();

  return (
    <>
      {state.toasts.map((toast, i) => (
        <Snackbar
          key={toast.id}
          open
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ bottom: `${(i * 72) + 16}px !important` }}
          onClose={() => dispatch({ type: 'REMOVE_TOAST', payload: toast.id })}
        >
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => dispatch({ type: 'REMOVE_TOAST', payload: toast.id })}
            sx={{ minWidth: 300, fontWeight: 500 }}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
