# Particle processing (soft TODO)

**Status:** Design sketch only; no implementation is scheduled. The current engine can form/break bonds and convert one particle's species, but cannot merge or split material. Its bath and fuel supply are open-system drives, and current unequal-mass conversions do not conserve total mass.

## Proposed behavior

- Add local, reversible build/breakdown rules such as `A + B + fuel ⇌ AB + waste`. A catalyst may change the rate but must remain present and unchanged. A rule fires only when its reactants, space, and required usable energy are available.
- Give each species a fixed composition of conserved material units. Require the composition and mass on both sides of every rule to balance. A composite may first be represented by bonded constituent particles; later, a single rendered particle could replace them if variable particle counts are useful. Rendering or grouping must never create material.
- Track chemical, bond, kinetic, and stored energy plus exchanges with the existing bath and external supply. A reaction pays for an uphill change from stored energy or explicit input; a downhill change deposits released energy into motion, storage, or the bath. Merging and splitting preserve total momentum unless an explicitly modeled environment takes the recoil. Thermostat kicks, drag, and fueling need recorded exchanges before the simulation can claim energy conservation for the system plus environment.
- Set forward/reverse rate ratios consistently with free-energy differences and bath temperature in an undriven equilibrium mode. A fuel-driven cycle must consume finite fuel and produce waste or exported heat; it must not generate unlimited work from a closed loop.

## Acceptance before enabling it

For every step, assert conserved material totals and a bounded energy-ledger residual, including boundary, bath, and supply exchanges. Test reversible assembly/cleavage, fuel exhaustion, momentum on merge/split, capacity limits, and seeded save/load replay. Expose feed, waste, heat, and assembly/cleavage counts so apparent growth can be distinguished from material creation. Until the bath and reaction ledger are implemented, describe this as an abstract driven chemistry rather than a thermodynamically closed simulation.
