// Repro-only: track the MWA relay WebSocket and simulate a socket error.
;(() => {
  const t0 = Date.now()
  const lines = []
  const box = document.createElement('div')
  box.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:45vh;overflow:auto;background:#000d;color:#0f0;font:11px/1.35 monospace;padding:6px'
  const btn = document.createElement('button')
  btn.textContent = 'Arm: socket error 31s into the next session'
  btn.style.cssText = 'display:block;width:100%;padding:12px;margin-bottom:6px;font:bold 15px sans-serif;background:#c00;color:#fff'
  const send = document.createElement('button')
  send.textContent = 'Arm + signAndSendTransaction (devnet memo)'
  send.style.cssText = 'display:block;width:100%;padding:12px;margin-bottom:6px;font:bold 15px sans-serif;background:#06c;color:#fff'
  send.onclick = () => {
    btn.click()
    window.__reproSignAndSend()
  }
  const pre = document.createElement('pre')
  pre.style.cssText = 'margin:0;white-space:pre-wrap'
  box.append(btn, send, pre)
  const log = (msg) => {
    const line = `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s ${msg}`
    lines.push(line)
    console.log('[repro]', line)
    pre.textContent = lines.slice(-40).join('\n')
  }
  window.__reproLog = log
  document.addEventListener('DOMContentLoaded', () => document.body.append(box))

  const sockets = []
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols)
      if (!String(url).includes("relay")) return
      const id = sockets.push(this)
      const opened = Date.now()
      let dropped = false
      this.__repro = { id, opened, markDropped: () => (dropped = true) }
      log(`ws#${id} new ${url}`)
      if (armed) {
        armed = false
        log(`ws#${id}: will dispatch error 31s after creation`)
        setTimeout(() => {
          if (this.readyState !== Native.OPEN) return log(`ws#${id} not open, skip`)
          log(`dispatching error on ws#${id} (${((Date.now() - opened) / 1000).toFixed(1)}s after creation)`)
          dropped = true
          this.dispatchEvent(new Event('error'))
          btn.textContent = 'Error dispatched — now approve in wallet'
        }, 31_000)
      }
      this.addEventListener('open', () => log(`ws#${id} open`))
      this.addEventListener('close', (e) => log(`ws#${id} close code=${e.code} clean=${e.wasClean}`))
      this.addEventListener('error', () => log(`ws#${id} error event`))
      this.addEventListener('message', (e) => {
        let kind = '?'
        try {
          const m = JSON.parse(e.data)
          kind = m[0] + (m[0] === 'EVENT' ? ` content.len=${m[2]?.content?.length ?? 0}` : '')
        } catch {}
        log(`ws#${id} recv ${kind}${dropped ? '  <-- after simulated error (SDK no longer listening)' : ''}`)
      })
    }
    send(data) {
      if (!this.__repro) return super.send(data)
      let kind = '?'
      try {
        const m = JSON.parse(data)
        kind = m[0] + (m[0] === 'EVENT' ? ` content.len=${m[1]?.content?.length ?? 0}` : '')
      } catch {}
      log(`ws#${this.__repro.id} send ${kind}`)
      return super.send(data)
    }
  }

  let armed = false
  btn.onclick = () => {
    armed = true
    btn.disabled = true
    btn.textContent = 'Armed — start the request now'
    log('armed: next relay socket gets an error 31s after it opens')
  }

  // Report how long the in-flight request has been pending.
  setInterval(() => {
    const busy = [...document.querySelectorAll('button')].find((b) => /…$/.test(b.textContent || ''))
    if (busy) log(`UI still pending: "${busy.textContent}"`)
  }, 10_000)
  window.addEventListener('unhandledrejection', (e) => log(`unhandledrejection: ${e.reason?.message ?? e.reason}`))
})()
