import type { LinerData } from '../src/liner/data'

/**
 * テスト用の便データ。本物（data/generated/liner.json）はチャレンジ提供データ由来で
 * git 管理外なので、テストは形だけ同じ小さなデータで行う。
 */
export const linerFixture: LinerData = {
  generatedAt: '2026-10-28T00:00:00.000Z',
  source: 'test',
  lines: { Keio: [[35.69, 139.7], [35.65, 139.54]] },
  trips: [
    {
      id: 'Weekday-7003',
      calendar: 'Weekday',
      trainNumber: '7003',
      direction: 'Outbound',
      origin: '新宿',
      destination: '京王八王子',
      departure: 1080,
      arrival: 1122,
      path: [
        { station: 'odpt.Station:Keio.Keio.Shinjuku', name: '新宿', lat: 35.69, lon: 139.7, dep: 1080, stop: true, est: false, km: 0 },
        { station: 'odpt.Station:Keio.Keio.Meidaimae', name: '明大前', lat: 35.668, lon: 139.65, arr: 1086, dep: 1086, stop: true, est: false, km: 5.2 },
        { station: 'odpt.Station:Keio.Keio.Hachimanyama', name: '八幡山', lat: 35.669, lon: 139.61, arr: 1089, dep: 1089, stop: false, est: true, km: 8.4 },
      ],
      overtakes: [{ station: '八幡山', t: 1089, trainType: '各駅停車', trainNumber: '1801', destination: '調布' }],
      passings: [
        { km: 1.2, t: 1082, trainType: '特急', trainNumber: '1750', destination: '新宿' },
        { km: 6.0, t: 1087, trainType: '各駅停車', trainNumber: '1802', destination: '新宿' },
      ],
      tunnels: [[0, 3.3]],
    },
    {
      id: 'SaturdayHoliday-7003',
      calendar: 'SaturdayHoliday',
      trainNumber: '7003',
      direction: 'Outbound',
      origin: '新宿',
      destination: '京王八王子',
      departure: 1020,
      arrival: 1059,
      path: [],
      overtakes: [],
      passings: [],
      tunnels: [],
    },
  ],
}
