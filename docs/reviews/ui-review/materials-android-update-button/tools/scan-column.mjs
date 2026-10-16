// 沿一条竖线（或横线）扫像素，按「颜色跳变」切段输出 —— 用来量「可见背景矩形 / 可见边框 / 缝」的实际像素位置。
// 输入：PNG（先由 ffmpeg 转成 rgb24 裸数据）；用法见同目录 README。
//   node scan-column.mjs <raw> <W> <H> col <x> <y0> <y1>
//   node scan-column.mjs <raw> <W> <H> row <y> <x0> <x1>
import { readFileSync } from 'node:fs'

const [raw, Ws, Hs, mode, fixedS, aS, bS] = process.argv.slice(2)
const W = Number(Ws), H = Number(Hs), fixed = Number(fixedS), a = Number(aS), b = Number(bS)
const buf = readFileSync(raw)
if (buf.length !== W * H * 3) throw new Error(`raw 大小 ${buf.length} != ${W * H * 3}`)

const at = (x, y) => {
  const o = (y * W + x) * 3
  return [buf[o], buf[o + 1], buf[o + 2]]
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
const near = (p, q, tol = 2) => p.every((v, i) => Math.abs(v - q[i]) <= tol)

console.log(`# ${mode} ${mode === 'col' ? 'x=' : 'y='}${fixed}  区间 ${a}..${b}`)
let start = a
let prev = mode === 'col' ? at(fixed, a) : at(a, fixed)
for (let i = a + 1; i <= b; i++) {
  const c = mode === 'col' ? at(fixed, i) : at(i, fixed)
  if (!near(c, prev)) {
    console.log(`${start}..${i - 1}  (${i - start} px)  ${hex(prev)}  rgb(${prev.join(',')})`)
    start = i
    prev = c
  }
}
console.log(`${start}..${b}  (${b - start + 1} px)  ${hex(prev)}  rgb(${prev.join(',')})`)
