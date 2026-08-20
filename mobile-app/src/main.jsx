import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })

  // A notification click while the app is already open can't call
  // React Router's navigate() from inside the service worker - it
  // posts {type:'navigate'} instead and a full navigation here re-enters
  // the SPA at the right URL.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'navigate' && event.data.link) {
      window.location.href = event.data.link
    }
  })
}
