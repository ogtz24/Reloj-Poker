// Estructura exacta del torneo extraída del PDF del usuario

export const DEFAULT_TOURNAMENT_NAME = 'Torneo de Poker';
export const DEFAULT_START_TIME = '12:00';

export const DEFAULT_ENTRY_TYPES = [
  { id: 'buyin', label: 'BUY-IN', chips: 30000, count: 32, price: 0, isPlayerEntry: true },
  { id: 'rebuy', label: 'REBUY', chips: 30000, count: 4, price: 0, isPlayerEntry: false },
  { id: 'doble_rebuy', label: 'DOBLE REBUY', chips: 65000, count: 40, price: 0, isPlayerEntry: false },
  { id: 'addon', label: 'ADD-ON', chips: 80000, count: 0, price: 0, isPlayerEntry: false },
  { id: 'addon_doble', label: 'ADD-ON + DOBLE REBUY', chips: 140000, count: 20, price: 0, isPlayerEntry: false },
];

// 30 niveles + 2 descansos exactos según la hoja de estructura
export const DEFAULT_SCHEDULE = [
  { id: 'r1', type: 'level', round: 1, sb: 100, bb: 100, ante: 0, durationMin: 20 },
  { id: 'r2', type: 'level', round: 2, sb: 100, bb: 200, ante: 200, durationMin: 20 },
  { id: 'r3', type: 'level', round: 3, sb: 200, bb: 300, ante: 300, durationMin: 20 },
  { id: 'r4', type: 'level', round: 4, sb: 200, bb: 400, ante: 400, durationMin: 20 },
  { id: 'r5', type: 'level', round: 5, sb: 300, bb: 500, ante: 500, durationMin: 20 },
  { id: 'r6', type: 'level', round: 6, sb: 300, bb: 600, ante: 600, durationMin: 20 },
  { id: 'r7', type: 'level', round: 7, sb: 400, bb: 800, ante: 800, durationMin: 20 },
  { id: 'r8', type: 'level', round: 8, sb: 500, bb: 1000, ante: 1000, durationMin: 20 },
  { id: 'r9', type: 'level', round: 9, sb: 600, bb: 1200, ante: 1200, durationMin: 20 },

  {
    id: 'b_comida',
    type: 'break',
    label: 'COMIDA',
    subtitle: 'Descanso para comer — Las fichas permanecen en mesa',
    durationMin: 60,
    closesRebuys: false,
  },

  { id: 'r10', type: 'level', round: 10, sb: 1000, bb: 1500, ante: 1500, durationMin: 20 },
  { id: 'r11', type: 'level', round: 11, sb: 1000, bb: 2000, ante: 2000, durationMin: 20 },
  { id: 'r12', type: 'level', round: 12, sb: 1500, bb: 2500, ante: 2500, durationMin: 20 },
  { id: 'r13', type: 'level', round: 13, sb: 1500, bb: 3000, ante: 3000, durationMin: 20 },
  { id: 'r14', type: 'level', round: 14, sb: 2000, bb: 4000, ante: 4000, durationMin: 20 },
  { id: 'r15', type: 'level', round: 15, sb: 2500, bb: 5000, ante: 5000, durationMin: 20 },
  { id: 'r16', type: 'level', round: 16, sb: 3000, bb: 6000, ante: 6000, durationMin: 20 },

  {
    id: 'b_recompras',
    type: 'break',
    label: 'FIN DE RECOMPRAS',
    subtitle: 'Último momento para Rebuy / Add-On — A partir del Nivel 17 es Freezeout',
    durationMin: 10,
    closesRebuys: true,
  },

  { id: 'r17', type: 'level', round: 17, sb: 4000, bb: 8000, ante: 8000, durationMin: 20 },
  { id: 'r18', type: 'level', round: 18, sb: 5000, bb: 10000, ante: 10000, durationMin: 20 },
  { id: 'r19', type: 'level', round: 19, sb: 6000, bb: 12000, ante: 12000, durationMin: 20 },
  { id: 'r20', type: 'level', round: 20, sb: 8000, bb: 16000, ante: 16000, durationMin: 20 },
  { id: 'r21', type: 'level', round: 21, sb: 10000, bb: 20000, ante: 20000, durationMin: 20 },
  { id: 'r22', type: 'level', round: 22, sb: 10000, bb: 25000, ante: 25000, durationMin: 20 },
  { id: 'r23', type: 'level', round: 23, sb: 15000, bb: 30000, ante: 30000, durationMin: 20 },
  { id: 'r24', type: 'level', round: 24, sb: 20000, bb: 40000, ante: 40000, durationMin: 20 },
  { id: 'r25', type: 'level', round: 25, sb: 25000, bb: 50000, ante: 50000, durationMin: 20 },
  { id: 'r26', type: 'level', round: 26, sb: 30000, bb: 60000, ante: 60000, durationMin: 20 },
  { id: 'r27', type: 'level', round: 27, sb: 40000, bb: 80000, ante: 80000, durationMin: 20 },
  { id: 'r28', type: 'level', round: 28, sb: 50000, bb: 100000, ante: 100000, durationMin: 20, note: 'ACABA AQUÍ' },
  { id: 'r29', type: 'level', round: 29, sb: 75000, bb: 150000, ante: 150000, durationMin: 20 },
  { id: 'r30', type: 'level', round: 30, sb: 100000, bb: 200000, ante: 200000, durationMin: 20 },
];

export const PAYOUT_PRESETS = {
  top3: { label: 'Top 3 (50% / 30% / 20%)', splits: [50, 30, 20] },
  top4: { label: 'Top 4 (45% / 25% / 18% / 12%)', splits: [45, 25, 18, 12] },
  top5: { label: 'Top 5 (40% / 25% / 15% / 12% / 8%)', splits: [40, 25, 15, 12, 8] },
  top6: { label: 'Top 6 (36% / 22% / 15% / 11% / 9% / 7%)', splits: [36, 22, 15, 11, 9, 7] },
};

export function cloneDefaults() {
  return {
    tournamentName: DEFAULT_TOURNAMENT_NAME,
    startTime: DEFAULT_START_TIME,
    schedule: DEFAULT_SCHEDULE.map((item) => ({ ...item })),
    entries: DEFAULT_ENTRY_TYPES.map((item) => ({ ...item })),
    playersRemaining: 32,
    payoutPreset: 'top4',
    soundEnabled: true,
    voiceEnabled: false,
  };
}
