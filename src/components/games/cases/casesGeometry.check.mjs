// Run: node src/components/games/cases/casesGeometry.check.mjs
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const server = await createServer({ server: { port: 5213, strictPort: true } })
const profile = await mkdtemp(join(tmpdir(), 'cases-geometry-'))
let chrome, socket
try {
    await server.listen()
    const { CaseMultiOpenGrid } = await server.ssrLoadModule('/src/components/games/cases/CasesGame.jsx')
    const item = { id: 'winner', skinId: 'winner', name: 'Winner', valueGc: 2 }
    const html = renderToStaticMarkup(React.createElement(CaseMultiOpenGrid, { activeCase: { name: 'Geometry case' }, casePhase: 'spin', results: [], trackOffsets: [0], tracks: [Array(32).fill(item)] }))
    const css = await readFile(new URL('./cases.css', import.meta.url), 'utf8')
    chrome = spawn('/home/compute_01/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
    let port
    for (let i = 0; i < 100; i++) {
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await new Promise(r => setTimeout(r, 50)) }
    }
    assert(port, 'Chromium debugger starts')
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:5213`, { method: 'PUT' })).json()
    socket = new WebSocket(page.webSocketDebuggerUrl); await once(socket, 'open')
    let id = 0
    const pending = new Map()
    socket.addEventListener('message', event => { const message = JSON.parse(String(event.data)); const entry = pending.get(message.id); if (entry) { pending.delete(message.id); message.error ? entry.reject(message.error) : entry.resolve(message.result) } })
    const send = (method, params) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })) })
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value }
    await send('Page.enable', {})
    await new Promise(r => setTimeout(r, 300))
    await send('Page.setDocumentContent', { frameId: (await send('Page.getFrameTree', {})).frameTree.frame.id, html: `<style>*{box-sizing:border-box}${css}.cases-carousel-track{transition:none!important}</style><div class="cases-stage" style="--case-tile-px:118px">${html}</div>` })
    for (const [width, height] of [[1610, 870], [390, 844], [1024, 800], [1610, 870]]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
        const result = await evaluate(`(async()=>{ const {getCaseReelMetrics,finalPrizeOffset}=await import('/src/components/games/cases/casesAnimation.js');const stage=document.querySelector('.cases-stage'); const metrics=getCaseReelMetrics(stage);const track=document.querySelector('.cases-carousel-track'); track.style.transform='translate('+finalPrizeOffset(0,28,metrics.tilePx,metrics.gapPx)+'px,-50%)';const tile=track.children[28].getBoundingClientRect(),pointer=document.querySelector('.cases-carousel-pointer').getBoundingClientRect();return {metrics,error:Math.abs((tile.left+tile.right)/2-pointer.left),tileWidth:tile.width}})()`)
        assert(result.error < 1, JSON.stringify({ width, height, ...result }))
        console.log(JSON.stringify({ width, height, ...result }))
    }
} finally {
    socket?.close(); chrome?.kill(); if (chrome) await once(chrome, 'exit').catch(() => {})
    await server.close(); await rm(profile, { recursive: true, force: true })
}
