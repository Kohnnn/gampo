import { describe, expect, it, vi } from 'vitest'
import { FEEDBACK_EVENTS, feedbackProfile, playFeedback } from './gameFeedback'

describe('game feedback vocabulary', () => {
    it('defines reusable feedback profiles', () => {
        expect(feedbackProfile(FEEDBACK_EVENTS.SPIN_START)).toMatchObject({ sfx: 'spinStart', haptic: 'select' })
        expect(feedbackProfile(FEEDBACK_EVENTS.BIG_WIN)).toMatchObject({ sfx: 'bigwin', haptic: 'rare' })
        expect(feedbackProfile('missing')).toBeNull()
    })

    it('dispatches sfx and haptics through provided adapters', () => {
        const play = vi.fn(() => true)
        const pulse = vi.fn(() => true)

        const result = playFeedback(FEEDBACK_EVENTS.BONUS_ENTER, {
            sfx: { play },
            haptic: pulse,
            hapticsEnabled: true,
        })

        expect(result).toEqual({ playedSfx: true, playedHaptic: true })
        expect(play).toHaveBeenCalledWith('bonusEnter', { volume: 0.9 })
        expect(pulse).toHaveBeenCalledWith('rare', { enabled: true, force: true })
    })
})
