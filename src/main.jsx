import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CreditProvider } from './context/CreditContext'
import { SocialProvider } from './context/SocialContext'
import { AudioProvider } from './audio/AudioProvider'
import { installLazyChunkRecoveryListener } from './components/lazyChunkRecovery'
import App from './App'
import './styles/index.css'

installLazyChunkRecoveryListener()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AudioProvider>
                <CreditProvider>
                    <SocialProvider>
                        <App />
                    </SocialProvider>
                </CreditProvider>
            </AudioProvider>
        </BrowserRouter>
    </React.StrictMode>
)
