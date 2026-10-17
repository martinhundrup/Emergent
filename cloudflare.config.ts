// Same assets-only pattern as the adjacent martinhundrup.com project.
export default {
  accountId: '68555cfc43ca5a5579ad49a3e7060711',
  worker: {
    name: 'emergent',
    compatibilityDate: '2026-10-16',
    workersDev: false,
    assets: { htmlHandling: 'auto-trailing-slash', notFoundHandling: 'single-page-application' },
    triggers: [
      { type: 'fetch', pattern: 'martinhundrup.com/emergent', zone: 'martinhundrup.com' },
      { type: 'fetch', pattern: 'martinhundrup.com/emergent/*', zone: 'martinhundrup.com' },
    ],
  },
};
