import { Component } from 'react'
import { Link } from 'react-router-dom'
import { recoverLazyChunk } from './lazyChunkRecovery'

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        if (!recoverLazyChunk(error)) console.error('GamePo route error:', error, info)
    }

    reset = () => {
        if (!recoverLazyChunk(this.state.error)) this.setState({ error: null })
    }

    render() {
        if (this.state.error) {
            return (
                <section className="route-error">
                    <h1>This game crashed</h1>
                    <p>The game component threw an error and was prevented from blanking the rest of the app.</p>
                    <pre className="route-error-msg">{String(this.state.error?.message || this.state.error)}</pre>
                    <div className="not-found-actions">
                        <button className="bp-bet-btn active" onClick={this.reset}>Retry</button>
                        <Link className="bp-bet-btn" to="/">Back to lobby</Link>
                    </div>
                </section>
            )
        }
        return this.props.children
    }
}
