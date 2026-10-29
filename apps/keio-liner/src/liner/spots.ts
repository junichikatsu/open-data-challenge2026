import spotsJson from '../../data/spots.json'

/**
 * 沿線スポット。scripts/build-spots.mjs が OpenStreetMap から作り、リポジトリに入れている。
 * OSM は ODbL なので、画面に attribution を必ず表示する。
 */

export interface Spot {
  id: string
  name: string
  nameEn: string
  category: string
  lat: number
  lon: number
  wikipedia: string
  /** 川だけ: 沿線の範囲に入っている長さ（km）。大きい川を優先して案内するのに使う */
  lengthKm?: number
}

interface SpotsFile {
  generatedAt: string
  attribution: string
  radiusMeters: number
  spots: Spot[]
}

const data = spotsJson as SpotsFile
const byId = new Map(data.spots.map((s) => [s.id, s]))

export function allSpots(): SpotsFile {
  return data
}

export function findSpot(id: string): Spot | undefined {
  return byId.get(id)
}
