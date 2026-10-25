import { themeById } from '../art/themes'
import { VIEW_H, VIEW_W } from './iso'
import { todayCount } from './rules'
import type { Room } from './types'

const W = 1080
const H = 1920
const G11 = 'Galmuri11, system-ui, sans-serif'
const INK = '#2b2233'
const ORANGE = '#ff7f2a'

function svgToImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', '1600')
  clone.setAttribute('height', String(Math.round((1600 * VIEW_H) / VIEW_W)))
  // 화면에서만 쓰는 선택·등장 애니메이션 표시는 빼고 그린다
  clone.querySelectorAll('.ghost').forEach((n) => n.remove())
  const xml = new XMLSerializer().serializeToString(clone)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.roundRect(x + 10, y + 10, w, h, r)
  ctx.fill()
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 6
  ctx.stroke()
}

/** 인스타 스토리(9:16) 공유 이미지: 미니홈피 창 안에 내 방 */
export async function renderStoryImage(svg: SVGSVGElement, room: Room, dropCount: number): Promise<Blob> {
  await Promise.all([document.fonts.load('44px Galmuri11'), document.fonts.load('700 44px Galmuri11')])
  const roomImg = await svgToImage(svg)
  const theme = themeById(room.theme)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // 바탕: 테마색 + 모눈
  ctx.fillStyle = theme.sky
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(43,34,51,0.07)'
  ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  // 미니홈피 창
  const px = 70
  const py = 250
  const pw = W - px * 2
  const rw = pw - 60
  const rh = (rw * VIEW_H) / VIEW_W
  const ph = 140 + rh + (room.motto ? 150 : 80)
  panel(ctx, px, py, pw, ph, 36, '#ffffff')

  // 창 제목줄
  ctx.fillStyle = ORANGE
  ctx.beginPath()
  ctx.roundRect(px, py, pw, 110, [36, 36, 0, 0])
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(px, py + 110)
  ctx.lineTo(px + pw, py + 110)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.font = `44px ${G11}`
  ctx.fillText(`${room.name}의 미니룸`, px + 44, py + 72)
  ctx.textAlign = 'right'
  ctx.font = `34px ${G11}`
  ctx.fillText(`TODAY ${todayCount(room)} | TOTAL ${room.totalVisits}`, px + pw - 44, py + 70)

  // 방
  ctx.drawImage(roomImg, px + 30, py + 140, rw, rh)

  // 한마디
  const my = py + 140 + rh + 40
  ctx.textAlign = 'center'
  ctx.fillStyle = '#8a7f96'
  ctx.font = `30px ${G11}`
  ctx.fillText(`친구들이 놓고 간 아이템 ${dropCount}개`, W / 2, my)
  if (room.motto) {
    ctx.fillStyle = INK
    ctx.font = `40px ${G11}`
    ctx.fillText(`“${room.motto}”`, W / 2, my + 64, pw - 80)
  }

  // 위 문구
  ctx.fillStyle = INK
  ctx.font = `700 64px ${G11}`
  ctx.fillText('내 방들이 와 줘', W / 2, 130)
  ctx.fillText('뭐 하나 놓고 가', W / 2, 210)

  // 링크 스티커 자리 안내
  const ay = py + ph + 90
  panel(ctx, 190, ay, W - 380, 120, 60, '#fff3b0')
  ctx.fillStyle = INK
  ctx.font = `40px ${G11}`
  ctx.fillText('↓ 링크 눌러서 들어와 ↓', W / 2, ay + 76)

  ctx.font = `700 48px ${G11}`
  ctx.fillText('방들이', W / 2, Math.min(H - 90, ay + 280))

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'),
  )
}
