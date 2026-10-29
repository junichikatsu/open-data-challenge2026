import { describe, expect, it } from 'vitest'
// @ts-expect-error 画面側は素の JS（JSDoc で型付け）なので型定義ファイルが無い
import { recommendSeat } from '../web/src/seat.js'

type Side = 'left' | 'right'
const spot = (name: string, category: string, side: Side, offsetM: number, lengthKm?: number) => ({
  spot: { id: `osm-n${name.length}`, name, nameEn: '', category, lat: 0, lon: 0, wikipedia: '', lengthKm },
  km: 1,
  offsetM,
  side,
})

describe('席の左右おすすめ', () => {
  it('見えやすいもの（競技場・近いもの）が多い側を勧め、その側の見どころを出す', () => {
    const a = recommendSeat([
      spot('味の素スタジアム', 'stadium', 'right', 200),
      spot('東京競馬場', 'stadium', 'right', 600),
      spot('小さな寺', 'temple', 'left', 100),
      spot('資料館', 'museum', 'left', 900),
    ])
    expect(a.side).toBe('right')
    expect(a.highlights.right.map((s: { name: string }) => s.name)).toEqual(['味の素スタジアム', '東京競馬場'])
    expect(a.highlights.left.map((s: { name: string }) => s.name)).toEqual(['小さな寺', '資料館'])
  })

  it('左右の差が小さければ「どちらでも」', () => {
    const a = recommendSeat([spot('公園A', 'park', 'left', 200), spot('公園B', 'park', 'right', 200)])
    expect(a.side).toBe('either')
  })

  it('川は左右の点数に入れず、線路の近くなら「渡る川」に入る。大きい川から並べ、用水は除く', () => {
    const a = recommendSeat([
      spot('小さな川', 'river', 'left', 50, 2),
      spot('玉川上水', 'river', 'left', 50, 5),
      spot('多摩川', 'river', 'right', 80, 30),
      spot('遠くの川', 'river', 'left', 900, 40),
    ])
    expect(a.side).toBeNull()
    expect(a.rivers).toEqual(['多摩川', '小さな川'])
  })
})
