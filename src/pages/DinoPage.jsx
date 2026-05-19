import DinoGame from '../components/DinoGame';
import CoreGameEducationDock from '../components/CoreGameEducationDock';

function DinoPage() {
    return (
        <>
            <DinoGame />
            <CoreGameEducationDock gameId="dino" defaultBet={5} winProbability={0.52} payoutMultiplier={1.9} />
        </>
    );
}

export default DinoPage;
