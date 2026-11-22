// stands for a fingerprinting script of another site: canvas, graphics card and audio, as such scripts read them
const canvas = document.createElement('canvas')
canvas.width = 240
canvas.height = 60
const ctx = canvas.getContext('2d')
ctx.fillStyle = '#f60'
ctx.fillRect(100, 1, 62, 20)
ctx.fillStyle = '#069'
ctx.font = '11pt Arial'
ctx.fillText('Cwm fjordbank gly 😃', 2, 15)
canvas.toDataURL()

const gl = document.createElement('canvas').getContext('webgl')
const info = gl && gl.getExtension('WEBGL_debug_renderer_info')
if (info) gl.getParameter(info.UNMASKED_RENDERER_WEBGL)

const audio = new OfflineAudioContext(1, 5000, 44100)
const oscillator = audio.createOscillator()
oscillator.connect(audio.destination)
oscillator.start(0)
audio.startRendering().catch(() => {})
