import MinesGame from '../components/MinesGame/MinesGame'
import CoreGameEducationDock from '../components/CoreGameEducationDock'

function MinesPage() {
    return (
        <>
            <MinesGame />
            <CoreGameEducationDock gameId="mines" defaultBet={5} winProbability={0.58} payoutMultiplier={1.7} />
        </>
    )
}

export default MinesPage
