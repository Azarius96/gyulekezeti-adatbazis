import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Ha egy oldal kódcsomagja deploy után már nem létezik a szerveren (a böngésző a régi verziót tartotta meg - jellemzően
// iPaden), egyszer automatikusan újratöltjük az oldalt, hogy a friss verzió töltődjön be.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('chunk-reload') === '1') return
    sessionStorage.setItem('chunk-reload', '1')
  } catch {
    // sessionStorage nélkül is újratöltünk
  }
  window.location.reload()
})
window.addEventListener('load', () => {
  try {
    sessionStorage.removeItem('chunk-reload')
  } catch {
    // nem gond
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
