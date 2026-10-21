import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"
import { handleOAuthSubdomainBounce } from "./lib/domain"

const isBouncing = handleOAuthSubdomainBounce()

if (!isBouncing) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

