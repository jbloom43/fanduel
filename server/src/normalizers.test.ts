import { describe, expect, it } from 'vitest';
import {
  normalizePlayersFromGamePackage,
  normalizeStatsFromGamePackage,
  extractClockFromStatus
} from './normalizers.js';

const sampleGamePackage = {
  boxscore: {
    players: [
      {
        team: { abbreviation: 'TB' },
        statistics: [
          {
            name: 'passing',
            labels: ['C/ATT', 'YDS', 'TD', 'INT'],
            athletes: [
              {
                athlete: {
                  id: '1001',
                  displayName: 'Baker Mayfield',
                  position: { abbreviation: 'QB' }
                },
                stats: ['20-30', '250', '2', '1']
              }
            ]
          },
          {
            name: 'rushing',
            labels: ['CAR', 'YDS', 'TD'],
            athletes: [
              {
                athlete: {
                  id: '1002',
                  displayName: 'Rachaad White',
                  position: { abbreviation: 'RB' }
                },
                stats: ['18', '75', '1']
              }
            ]
          },
          {
            name: 'receiving',
            labels: ['REC', 'TGTS', 'YDS', 'TD'],
            athletes: [
              {
                athlete: {
                  id: '1003',
                  displayName: 'Mike Evans',
                  position: { abbreviation: 'WR' }
                },
                stats: ['6', '10', '110', '1']
              }
            ]
          }
        ]
      },
      {
        team: { abbreviation: 'CAR' },
        statistics: [
          {
            name: 'passing',
            labels: ['C/ATT', 'YDS', 'TD', 'INT'],
            athletes: [
              {
                athlete: {
                  id: '2001',
                  displayName: 'Bryce Young',
                  position: { abbreviation: 'QB' }
                },
                stats: ['28-41', '212', '1', '0']
              }
            ]
          }
        ]
      }
    ]
  },
  header: {
    competitions: [
      {
        status: {
          displayClock: '12:34',
          period: 3,
          clock: 754
        }
      }
    ]
  }
};

describe('normalizers', () => {
  it('normalizes player roster information', () => {
    const roster = normalizePlayersFromGamePackage(sampleGamePackage);
    expect(roster['1001']).toMatchObject({ fullName: 'Baker Mayfield', team: 'TB', position: 'QB' });
    expect(roster['1003']).toMatchObject({ fullName: 'Mike Evans', team: 'TB' });
  });

  it('normalizes player statistics', () => {
    const stats = normalizeStatsFromGamePackage(sampleGamePackage);
    expect(stats['1001']).toMatchObject({
      passingAttempts: 30,
      passingCompletions: 20,
      passingYards: 250,
      passingTD: 2,
      interceptions: 1
    });
    expect(stats['1002']).toMatchObject({
      rushingCarries: 18,
      rushingYards: 75,
      rushingTD: 1
    });
    expect(stats['1003']).toMatchObject({
      receivingReceptions: 6,
      receivingTargets: 10,
      receivingYards: 110,
      receivingTD: 1
    });
  });

  it('extracts game clock state', () => {
    const status = sampleGamePackage.header.competitions[0].status;
    const clock = extractClockFromStatus(status);
    expect(clock).toMatchObject({ period: 3, totalSecondsRemaining: expect.any(Number) });
  });
});
