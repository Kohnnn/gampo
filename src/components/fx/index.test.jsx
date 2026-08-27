import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useReduceMotion } from './index'

let tuple

function Capture() {
    tuple = useReduceMotion()
    return <span>{String(tuple[0])}</span>
}

describe('useReduceMotion', () => {
    it('keeps its tuple contract over the current canonical singleton for literal and functional updates', () => {
        expect(renderToStaticMarkup(<Capture />)).toBe('<span>false</span>')
        expect(tuple).toHaveLength(2)
        expect(typeof tuple[1]).toBe('function')
        tuple[1](true)
        expect(renderToStaticMarkup(<Capture />)).toBe('<span>true</span>')
        tuple[1](value => !value)
        expect(renderToStaticMarkup(<Capture />)).toBe('<span>false</span>')
    })
})
