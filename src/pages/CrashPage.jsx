import CrashGame from '../components/CrashGame/CrashGame'
import CoreGameEducationDock from '../components/CoreGameEducationDock'

function CrashPage() {
    return (
        <>
            <CrashGame />
            <CoreGameEducationDock gameId="crash" defaultBet={5} winProbability={0.49} payoutMultiplier={2} />
        </>
    )
}

export default CrashPage
