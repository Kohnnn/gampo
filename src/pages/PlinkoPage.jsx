import PlinkoGame from '../components/PlinkoGame'
import CoreGameEducationDock from '../components/CoreGameEducationDock'

function PlinkoPage() {
    return (
        <>
            <PlinkoGame />
            <CoreGameEducationDock gameId="plinko" defaultBet={5} winProbability={0.42} payoutMultiplier={2.1} />
        </>
    )
}

export default PlinkoPage
