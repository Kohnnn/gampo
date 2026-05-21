import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import NotFoundPage from './components/NotFoundPage'
import ErrorBoundary from './components/ErrorBoundary'
import HomePage from './pages/HomePage'

// Casino lobby surfaces (small, eager)
import {
    ActivityPage,
    LearnPage,
    LiveStudioPage,
    MissionsPage,
    OriginalsPage,
    SlotsLobbyPage,
    VipPage,
    VerifyPage,
    RacePage,
    PromotionsPage,
} from './pages/CasinoPages'

// Heavy game pages: lazy-load
const SportsPage = lazy(() => import('./pages/SportsPage'))

// Refactored per-game routes (sub-batch A + B + C + D)
const CrashGame = lazy(() => import('./components/games/crash/CrashGame'))
const PlinkoGame = lazy(() => import('./components/games/plinko/PlinkoGame'))
const DinoGame = lazy(() => import('./components/games/dino/DinoGame'))
const MinesGame = lazy(() => import('./components/games/mines/MinesGame'))
const DiceGame = lazy(() => import('./components/games/dice/DiceGame'))
const LimboGame = lazy(() => import('./components/games/limbo/LimboGame'))
const WheelGame = lazy(() => import('./components/games/wheel/WheelGame'))
const RouletteGame = lazy(() => import('./components/games/roulette/RouletteGame'))
const BaccaratGame = lazy(() => import('./components/games/baccarat/BaccaratGame'))
const SicBoGame = lazy(() => import('./components/games/sicbo/SicBoGame'))
const SlotsGame = lazy(() => import('./components/games/slots/SlotsGame'))
const TowerGame = lazy(() => import('./components/games/tower/TowerGame'))
const HiloGame = lazy(() => import('./components/games/hilo/HiloGame'))
const CoinFlipGame = lazy(() => import('./components/games/coinflip/CoinFlipGame'))
const RpsGame = lazy(() => import('./components/games/rps/RpsGame'))
const GuessGame = lazy(() => import('./components/games/guess/GuessGame'))
const ColorGame = lazy(() => import('./components/games/color/ColorGame'))
const CasinoWarGame = lazy(() => import('./components/games/war/CasinoWarGame'))
const VideoPokerGame = lazy(() => import('./components/games/videopoker/VideoPokerGame'))
const LotteryGame = lazy(() => import('./components/games/lottery/LotteryGame'))
const KenoGame = lazy(() => import('./components/games/keno/KenoGame'))
const ChickenCrossGame = lazy(() => import('./components/games/chickencross/ChickenCrossGame'))
const BlackjackGame = lazy(() => import('./components/games/blackjack/BlackjackGame'))
const PokerGame = lazy(() => import('./components/PokerGame/PokerGame'))

function RouteFallback() {
    return (
        <div className="route-fallback">
            <div className="route-spinner" />
            <span>Loading lab...</span>
        </div>
    )
}

function lazied(element) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>{element}</Suspense>
        </ErrorBoundary>
    )
}

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="originals" element={<OriginalsPage />} />
                <Route path="slots-lobby" element={<SlotsLobbyPage />} />
                <Route path="live" element={<LiveStudioPage />} />
                <Route path="missions" element={<MissionsPage />} />
                <Route path="vip" element={<VipPage />} />
                <Route path="learn" element={<LearnPage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="verify" element={<VerifyPage />} />
                <Route path="race" element={<RacePage />} />
                <Route path="promotions" element={<PromotionsPage />} />
                <Route path="crash" element={lazied(<CrashGame />)} />
                <Route path="plinko" element={lazied(<PlinkoGame />)} />
                <Route path="dino" element={lazied(<DinoGame />)} />
                <Route path="mines" element={lazied(<MinesGame />)} />
                <Route path="sports" element={lazied(<SportsPage />)} />
                <Route path="dice" element={lazied(<DiceGame />)} />
                <Route path="limbo" element={lazied(<LimboGame />)} />
                <Route path="keno" element={lazied(<KenoGame />)} />
                <Route path="wheel" element={lazied(<WheelGame />)} />
                <Route path="roulette" element={lazied(<RouletteGame />)} />
                <Route path="blackjack" element={lazied(<BlackjackGame />)} />
                <Route path="slots" element={lazied(<SlotsGame />)} />
                <Route path="coinflip" element={lazied(<CoinFlipGame />)} />
                <Route path="rps" element={lazied(<RpsGame />)} />
                <Route path="guess" element={lazied(<GuessGame />)} />
                <Route path="hilo" element={lazied(<HiloGame />)} />
                <Route path="hilocards" element={<Navigate to="/hilo" replace />} />
                <Route path="baccarat" element={lazied(<BaccaratGame />)} />
                <Route path="sicbo" element={lazied(<SicBoGame />)} />
                <Route path="videopoker" element={lazied(<VideoPokerGame />)} />
                <Route path="color" element={lazied(<ColorGame />)} />
                <Route path="colorpick" element={<Navigate to="/color" replace />} />
                <Route path="tower" element={lazied(<TowerGame />)} />
                <Route path="lottery" element={lazied(<LotteryGame />)} />
                <Route path="war" element={lazied(<CasinoWarGame />)} />
                <Route path="casinowar" element={<Navigate to="/war" replace />} />
                <Route path="chickencross" element={lazied(<ChickenCrossGame />)} />
                <Route path="poker" element={lazied(<PokerGame />)} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    )
}

export default App
