import { settingsFor, luckySettingsFor, PRESETS, speciesDefaults, validateSettings, LIMITS } from './simulation.js';
import { frameBuffers } from './frame-pool.js';
import { UniverseRenderer } from './renderer.js';
import { WORLD_FIELDS, PHYSICS_FIELDS, BOND_FIELDS, CHARGE_FIELDS, ENERGY_FIELDS, SPECIES_FIELDS, REACTION_FIELDS, REACTION_GLOBAL_FIELDS, APPEARANCE_FIELDS, GUIDES } from './controls.js';

const $ = id => document.getElementById(id);
const letter = i => {
  let result = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
};
const appBasePath = new URL('.', import.meta.url).pathname;
const initialParams = new URLSearchParams(window.location.search);
const pathSeed = window.location.pathname.startsWith(appBasePath) ? window.location.pathname.slice(appBasePath.length) : '';
const requestedSeed = /^\d+$/.test(pathSeed) ? pathSeed : initialParams.get('seed');
const parsedSeed = requestedSeed !== null && /^\d+$/.test(requestedSeed) ? Number(requestedSeed) : NaN;
const initialSeed = Number.isInteger(parsedSeed) && parsedSeed <= 4294967295 ? parsedSeed : 42;
let settings = settingsFor('soup', 1200, initialSeed), worldDraft = {}, worldSizeAnchor = {}, selectedSpecies = 0, renderer, worker;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let history = [], lastSample = -1, lastFrame, lastStats, activePair = [0, 0], toastTimer, tooltipAnchor;
let requestId = 0, restartPending = false, heldFrame, reactionPage = 0, pendingWorldRequest = 0, expectedGeneration = 0;
const REACTION_PAGE_SIZE = 8;
const send = data => {
  const id = ++requestId;
  if (['init', 'reset', 'import'].includes(data.type)) pendingWorldRequest = id;
  worker?.postMessage({ ...data, requestId: id });
};
function recycleFrame(frame) {
  if (!frame?.frameId) return;
  const { frameId, positions, types, energies, bonds } = frame;
  worker.postMessage({ type: 'recycle', frameId, positions, types, energies, bonds }, frameBuffers(frame));
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4500);
}
function fillRange(input) {
  input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
}
function pending(message = 'RESTART PENDING') { restartPending = true; $('edit-status').textContent = message; $('edit-status').classList.add('pending'); }
function liveStatus() { if (!restartPending) { $('edit-status').textContent = 'LIVE MODEL'; $('edit-status').classList.remove('pending'); } }
function helpButton(text, name) {
  const button = element('button', '?', 'help'); button.type = 'button'; button.dataset.help = text;
  button.setAttribute('aria-label', `About ${name}`); return button;
}
function format(value, step) { return step >= 1 ? String(Math.round(value)) : Number(value).toFixed(step >= .1 ? 1 : 2); }
function controls(containerId, fields, get, change, prefix = '') {
  const container = typeof containerId === 'string' ? $(containerId) : containerId;
  container.replaceChildren();
  for (const field of fields) {
    const id = prefix + field.key, wrapper = element('div', undefined, 'range-control');
    const label = element('label', undefined, 'range-label'); label.htmlFor = id;
    const caption = element('span', field.label); caption.append(helpButton(field.help, field.label));
    const numeric = element('input', undefined, 'number-value'); numeric.type = 'number'; numeric.id = `${id}-value`;
    numeric.min = field.min; numeric.max = field.max; numeric.step = field.step; numeric.value = get(field.key);
    numeric.setAttribute('aria-label', `${field.label} value`);
    label.append(caption, numeric);
    const range = element('input'); range.type = 'range'; range.id = id; range.min = field.min; range.max = field.max; range.step = field.step; range.value = get(field.key); fillRange(range);
    const update = (source) => {
      const oldValue = get(field.key), raw = Number(source.value);
      if (source.value === '' || !Number.isFinite(raw)) { numeric.value = oldValue; return; }
      let value = Math.max(field.min, Math.min(field.max, raw));
      if (field.step >= 1) value = Math.round(value);
      if (change(field.key, value) === false) value = oldValue;
      numeric.value = format(value, field.step); range.value = value; fillRange(range);
    };
    range.addEventListener('input', () => update(range)); numeric.addEventListener('change', () => update(numeric));
    wrapper.append(label, range); container.append(wrapper);
  }
}
function configure(patch) {
  try {
    settings = validateSettings({ ...settings, ...patch });
    send({ type: 'configure', patch }); renderer?.setSettings(settings); liveStatus(); colorKey();
    return true;
  } catch (error) { toast(error.message); return false; }
}
function switchTab(name) {
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    $(`panel-${button.dataset.tab}`).hidden = !active;
  }
  document.querySelector('.panel-scroll').scrollTop = 0;
  hideTooltip();
}
function renderGuide() {
  const guide = GUIDES[settings.preset];
  $('scene-name').textContent = PRESETS[settings.preset].name;
  $('scene-description').textContent = guide.summary;
  $('preset-short').textContent = guide.summary;
  $('guide-title').textContent = `Understanding ${PRESETS[settings.preset].name.toLowerCase()}`;
  $('preset-explanation').textContent = guide.explanation;
  $('preset-experiment').textContent = guide.experiment; $('preset-observe').textContent = guide.observe;
  $('experiment-seed').textContent = String(settings.seed).padStart(4, '0');
  $('world-dimension').textContent = `3D · ${settings.boxSize}³ · REFLECTIVE`;
}
function drawMatrix() {
  const matrix = $('matrix'), count = settings.species.length;
  $('pair-editor').hidden = count <= 6;
  matrix.hidden = count > 6;
  if (count > 6) {
    matrix.replaceChildren();
    fillSpeciesOptions($('pair-target'), Math.min(Number($('pair-target').value) || 0, count - 1), $('pair-search').value);
    const other = Number($('pair-target').value);
    $('pair-source').textContent = `${letter(selectedSpecies)} · ${settings.species[selectedSpecies].name}`;
    $('edit-pair').textContent = `Edit affinity: ${settings.matrix[selectedSpecies * count + other].toFixed(2)}`;
    return;
  }
  matrix.replaceChildren(); matrix.style.gridTemplateColumns = `20px repeat(${count}, minmax(0, 1fr))`;
  for (let row = -1; row < count; row++) for (let col = -1; col < count; col++) {
    if (row < 0 || col < 0) {
      const label = element('span', row === -1 && col === -1 ? '' : letter(Math.max(row, col)), 'matrix-label');
      if (row !== col) label.style.setProperty('--species-color', settings.species[Math.max(row, col)].color);
      matrix.append(label); continue;
    }
    const value = settings.matrix[row * count + col];
    const button = element('button', `${value > 0 ? '+' : ''}${value.toFixed(count > 4 ? 1 : 2)}`, value < 0 ? 'negative' : '');
    button.setAttribute('aria-label', `${settings.species[row].name} to ${settings.species[col].name} affinity ${value.toFixed(2)}`);
    button.addEventListener('click', () => {
      editPair(row, col);
    }); matrix.append(button);
  }
}
function editPair(row, col) {
  activePair = [row, col]; const current = settings.matrix[row * settings.species.length + col];
  $('affinity-title').textContent = `${letter(row)} · ${settings.species[row].name} ↔ ${letter(col)} · ${settings.species[col].name}`;
  $('affinity').value = current; $('affinity-value').value = current.toFixed(2); fillRange($('affinity')); $('affinity-dialog').showModal();
}
function fillSpeciesOptions(select, selected, filter = '') {
  const query = filter.trim().toLowerCase(); select.replaceChildren();
  settings.species.forEach((species, i) => {
    const text = `${letter(i)} · ${species.name}`;
    if (query && !text.toLowerCase().includes(query) && i !== selected) return;
    const option = element('option', text); option.value = i; select.append(option);
  });
  select.value = selected;
}
function speciesTabs() {
  $('species-tabs').replaceChildren();
  $('species-catalog').hidden = settings.species.length <= 6;
  $('species-count').value = settings.species.length;
  $('species-count').max = LIMITS.species;
  if (settings.species.length > 6) {
    fillSpeciesOptions($('species-select'), selectedSpecies, $('species-search').value);
    return;
  }
  settings.species.forEach((species, i) => {
    const button = element('button'); const dot = element('i'); dot.style.background = species.color;
    button.append(dot, document.createTextNode(letter(i))); button.title = species.name;
    button.setAttribute('aria-label', `Edit species ${letter(i)}: ${species.name}`); button.setAttribute('aria-pressed', String(i === selectedSpecies));
    button.addEventListener('click', () => { selectedSpecies = i; renderSpecies(); }); $('species-tabs').append(button);
  });
}
function renderSpecies() {
  selectedSpecies = Math.min(selectedSpecies, settings.species.length - 1); speciesTabs();
  const species = settings.species[selectedSpecies];
  $('species-name').value = species.name; $('species-color').value = species.color;
  $('add-species').disabled = settings.species.length >= LIMITS.species; $('remove-species').disabled = settings.species.length <= 2;
  controls('species-controls', SPECIES_FIELDS, key => settings.species[selectedSpecies][key], (key, value) => {
    const next = structuredClone(settings.species); next[selectedSpecies][key] = value;
    const ok = configure({ species: next }); if (ok && key === 'abundance') pending('MIXTURE ON RESTART'); return ok;
  }, 'species-');
  drawMatrix();
}
function reactionEquation(rule) {
  const name = i => `${letter(i)} (${settings.species[i].name})`;
  return rule.catalyst < 0 ? `${name(rule.from)} → ${name(rule.to)}` : `${letter(rule.from)} + ${letter(rule.catalyst)} → ${letter(rule.to)} + ${letter(rule.catalyst)} · ${settings.species[rule.catalyst].name} catalyzes`;
}
function renderReactions() {
  const list = $('reaction-list'); list.replaceChildren();
  $('add-reaction').disabled = settings.reactions.length >= LIMITS.reactions;
  if (!settings.reactions.length) list.append(element('p', 'No reaction rules. Particles retain their species. Add a rule or try the Catalytic cycle recipe.', 'reaction-empty'));
  const query = $('reaction-search').value.trim().toLowerCase();
  const matching = settings.reactions.map((rule, index) => ({ rule, index })).filter(({ rule }) => !query ||
    `${rule.name} ${reactionEquation(rule)} ${settings.species[rule.from].name} ${settings.species[rule.to].name} ${settings.species[rule.catalyst]?.name ?? ''}`.toLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(matching.length / REACTION_PAGE_SIZE));
  reactionPage = Math.min(reactionPage, pages - 1);
  $('reaction-page').textContent = `${matching.length} rules · ${reactionPage + 1} / ${pages}`;
  $('reaction-prev').disabled = reactionPage === 0; $('reaction-next').disabled = reactionPage >= pages - 1;
  $('reaction-pagination').hidden = settings.reactions.length <= REACTION_PAGE_SIZE && !query;
  if (settings.reactions.length && !matching.length) list.append(element('p', 'No matching rules.', 'reaction-empty'));
  matching.slice(reactionPage * REACTION_PAGE_SIZE, (reactionPage + 1) * REACTION_PAGE_SIZE).forEach(({ rule, index }) => {
    const card = element('article', undefined, 'reaction-card'), title = element('div', undefined, 'reaction-title-row');
    const name = element('input'); name.value = rule.name; name.maxLength = 48; name.setAttribute('aria-label', `Reaction ${index + 1} name`);
    name.addEventListener('change', () => { const next = structuredClone(settings.reactions); next[index].name = name.value.trim() || `Reaction ${index + 1}`; configure({ reactions: next }); name.value = settings.reactions[index].name; });
    const remove = element('button', '×'); remove.setAttribute('aria-label', `Remove reaction ${index + 1}`);
    remove.addEventListener('click', () => { configure({ reactions: settings.reactions.filter((_, i) => i !== index) }); renderReactions(); });
    title.append(name, remove); card.append(title, element('div', reactionEquation(rule), 'reaction-equation'));
    const selects = element('div', undefined, 'reaction-selects');
    for (const [key, caption] of [['from', 'Substrate'], ['to', 'Product'], ['catalyst', 'Required nearby catalyst']]) {
      const label = element('label', caption), select = element('select'); select.id = `reaction-${index}-${key}`;
      if (key === 'catalyst') { const option = element('option', 'None · spontaneous'); option.value = -1; select.append(option); }
      settings.species.forEach((species, i) => { const option = element('option', `${letter(i)} · ${species.name}`); option.value = i; select.append(option); });
      select.value = rule[key]; label.append(select); selects.append(label);
      select.addEventListener('change', () => {
        const next = structuredClone(settings.reactions); next[index][key] = Number(select.value);
        if (next[index].from === next[index].to) {
          next[index][key === 'from' ? 'to' : 'from'] = (Number(select.value) + 1) % settings.species.length;
          toast('Adjusted the other species so the reaction changes the substrate.');
        }
        configure({ reactions: next }); renderReactions();
      });
    }
    card.append(selects); const fields = element('div'); card.append(fields);
    controls(fields, REACTION_FIELDS, key => settings.reactions[index][key], (key, value) => {
      const next = structuredClone(settings.reactions); next[index][key] = value; return configure({ reactions: next });
    }, `reaction-${index}-`); list.append(card);
  });
}
function syncShareUrl() {
  const url = new URL(window.location.href);
  url.pathname = `${appBasePath}${settings.seed}`;
  url.search = '';
  window.history.replaceState(window.history.state, '', url);
}
function syncWorldDraftInputs() {
  for (const key of ['count', 'boxSize']) {
    $(key).value = worldDraft[key];
    $(`${key}-value`).value = worldDraft[key];
    fillRange($(key));
  }
}
function syncSimulationSizeControl() {
  const slider = $('simulation-size');
  const countField = WORLD_FIELDS.find(field => field.key === 'count');
  const boxField = WORLD_FIELDS.find(field => field.key === 'boxSize');
  const side = worldSizeAnchor.boxSize, count = worldSizeAnchor.count;
  slider.min = Math.max(boxField.min, Math.ceil(side * Math.cbrt(countField.min / count)));
  slider.max = Math.min(boxField.max, Math.floor(side * Math.cbrt(countField.max / count)));
  slider.value = worldDraft.boxSize;
  slider.disabled = Number(slider.min) >= Number(slider.max);
  if (slider.disabled) slider.style.setProperty('--fill', '100%'); else fillRange(slider);
  $('simulation-size-value').textContent = `${worldDraft.boxSize}³`;
  $('simulation-size-note').textContent = `${worldDraft.count.toLocaleString()} particles · ${worldDraft.boxSize}³ box · similar density`;
  slider.setAttribute('aria-valuetext', `${worldDraft.boxSize} cubed, ${worldDraft.count.toLocaleString()} particles`);
}
function renderSettings() {
  worldDraft = { count: settings.count, boxSize: settings.boxSize }; worldSizeAnchor = { ...worldDraft }; restartPending = false; liveStatus();
  syncShareUrl();
  $('preset').value = settings.preset; $('seed').value = settings.seed;
  controls('world-reset-controls', WORLD_FIELDS, key => worldDraft[key], (key, value) => { worldDraft[key] = value; worldSizeAnchor = { ...worldDraft }; syncSimulationSizeControl(); pending(); });
  syncSimulationSizeControl();
  for (const [id, fields] of [['physics-controls', PHYSICS_FIELDS], ['bond-controls', BOND_FIELDS], ['charge-controls', CHARGE_FIELDS], ['energy-controls', ENERGY_FIELDS]]) {
    controls(id, fields, key => settings[key], (key, value) => configure({ [key]: value }));
  }
  controls('reaction-global-controls', REACTION_GLOBAL_FIELDS, key => settings[key], (key, value) => configure({ [key]: value }));
  renderGuide(); renderSpecies(); renderReactions(); renderer?.setSettings(settings); colorKey(); updateBondNote();
}
function clearHistory() { history = []; lastSample = -1; lastStats = null; lastFrame = null; $('history-line').setAttribute('d', ''); $('history-area').setAttribute('d', ''); renderer?.select(null); updateInspector(); }
function restart(useFields = false, message = 'Experiment restarted from its seed.', candidate = settings) {
  try {
    let next = candidate;
    if (useFields) {
      if (!$('seed').value) throw new Error('Enter a whole-number seed.');
      next = { ...candidate, ...worldDraft, seed: Number($('seed').value) };
    }
    settings = validateSettings(next); clearHistory(); renderSettings(); send({ type: 'reset', settings }); toast(message); return true;
  } catch (error) { toast(error.message); return false; }
}
function updateStats(stats) {
  lastStats = stats;
  $('particle-stat').textContent = stats.particles.toLocaleString(); $('species-stat').textContent = `${settings.species.length} defined · ${stats.speciesCounts.filter(Boolean).length} present`;
  $('bond-stat').textContent = stats.bonds.toLocaleString(); $('cluster-stat').textContent = stats.clusters.toLocaleString();
  $('largest-stat').textContent = `Largest: ${stats.largest.toLocaleString()} particles`;
  $('bond-age-stat').textContent = `Mean bond age: ${stats.meanBondAge.toFixed(1)} s`;
  $('reaction-stat').textContent = stats.reactionRate.toFixed(1); $('reaction-total').textContent = `${stats.reactions.toLocaleString()} conversions in this run`;
  $('bond-turnover').textContent = `${stats.bondsFormed.toLocaleString()} formed · ${stats.bondsBroken.toLocaleString()} broken`;
  $('energy-stat').textContent = `Mean kinetic energy: ${stats.energy.toFixed(2)}`;
  $('stored-energy-stat').textContent = `Stored energy: ${stats.meanEnergy.toFixed(2)} / 10`;
  $('active-stat').textContent = `Powered: ${Math.round(stats.activeFraction * 100)}% · alignment: ${Math.round(stats.polarOrder * 100)}%`;
  $('sim-rate').textContent = Math.round(stats.stepsPerSecond ?? 0);
  $('step-ms').textContent = (stats.stepMs ?? 0).toFixed(1);
  $('sim-time').textContent = `${String(Math.floor(stats.time / 60)).padStart(2, '0')}:${(stats.time % 60).toFixed(1).padStart(4, '0')}`;
  {
    let entropy = 0; for (const count of stats.speciesCounts) if (count) { const p = count / stats.particles; entropy -= p * Math.log(p); }
    const sample = { time: stats.time, bonded: stats.bonded / stats.particles, largest: stats.largest / stats.particles, energy: stats.meanEnergy, reactions: stats.reactionRate, diversity: entropy / Math.log(settings.species.length) };
    if (history.at(-1)?.time === stats.time) history[history.length - 1] = sample; else history.push(sample);
    lastSample = stats.time; history = history.filter(item => item.time >= stats.time - 120);
  }
  drawChart(); renderPopulation(stats); updateBondNote(); updateInspector();
}
function drawChart() {
  if (!lastStats || !history.length) return;
  const metric = $('chart-metric').value, now = lastStats.time;
  const maximum = metric === 'energy' ? 10 : metric === 'reactions' ? Math.max(1, ...history.map(item => item.reactions)) : 1;
  const display = value => metric === 'energy' ? value.toFixed(2) : metric === 'reactions' ? `${value.toFixed(1)} / s` : `${Math.round(value * 100)}%`;
  $('chart-value').textContent = display(history.at(-1)[metric]); $('chart-max').textContent = display(maximum);
  $('history-chart').setAttribute('aria-label', `${$('chart-metric').selectedOptions[0].textContent} over the last 120 simulation seconds; current ${display(history.at(-1)[metric])}`);
  const path = history.map((item, i) => `${i ? 'L' : 'M'}${(800 * (1 - (now - item.time) / 120)).toFixed(1)},${(85 - item[metric] / maximum * 80).toFixed(1)}`).join(' ');
  $('history-line').setAttribute('d', path);
  $('history-area').setAttribute('d', `${path} L800,85 L${(800 * (1 - (now - history[0].time) / 120)).toFixed(1)},85 Z`);
}
function renderPopulation(stats) {
  const bar = $('population-bar'), legend = $('population-legend');
  const rebuild = bar.children.length !== settings.species.length;
  if (rebuild) {
    bar.replaceChildren(); legend.replaceChildren();
    for (let i = 0; i < settings.species.length; i++) {
      bar.append(element('span'));
      const row = element('span'); row.append(element('i'), element('span'), element('b')); legend.append(row);
    }
  }
  settings.species.forEach((species, i) => {
    const count = stats.speciesCounts[i] ?? 0, part = bar.children[i], label = legend.children[i];
    part.style.background = species.color; part.style.width = `${count / stats.particles * 100}%`; part.title = `${species.name}: ${count}`;
    label.children[0].style.background = species.color; label.children[1].textContent = `${letter(i)} · ${species.name}`;
    label.children[2].textContent = count.toLocaleString();
  });
}
function updateBondNote() {
  const count = lastFrame ? lastFrame.bonds.length / 2 : 0, visible = $('show-bonds').checked;
  const unbondedGas = settings.preset === 'gas' && settings.bondStrength === 0 && settings.species.every(item => item.valence === 0) && settings.matrix.every(value => value === 0);
  $('visible-bond-count').textContent = visible ? count.toLocaleString() : 'hidden';
  $('bond-explanation').textContent = !visible ? `${count.toLocaleString()} physical bonds exist; drawing is hidden. Toggle Show bonds to reveal them.` : count ? `${count.toLocaleString()} bonds drawn. Bond network reveals connectivity; click a particle to inspect its connections.` : unbondedGas ? 'Inert gas has no bonds: valence, affinity, and bond strength are zero. See the preset explanation below.' : 'No bonds yet. Formation needs nearby compatible species, spare valence, and nonzero species/global bond strength.';
}
function updateInspector() {
  const id = renderer?.selectedId;
  $('focus-selection').disabled = !Number.isInteger(id) || !lastFrame || id >= lastFrame.types.length;
  if (id === null || id === undefined || !lastFrame || id >= lastFrame.types.length) { $('inspector').textContent = 'No particle selected.'; $('selection-hint').hidden = true; return; }
  const species = settings.species[lastFrame.types[id]]; if (!species) return;
  renderer.ensureTopology();
  const bonds = renderer.degrees[id];
  const values = [['Particle', `#${id + 1}`], ['Species', `${letter(lastFrame.types[id])} · ${species.name}`], ['Bonds / valence', `${bonds} / ${species.valence}`], ['Stored energy', `${lastFrame.energies[id].toFixed(2)} / 10`], ['Mass / charge', `${species.mass} / ${species.charge}`], ['Position', Array.from(lastFrame.positions.subarray(id * 3, id * 3 + 3)).map(v => v.toFixed(1)).join(', ')]];
  let list = $('inspector').querySelector('dl');
  if (!list) {
    list = element('dl'); for (const [key] of values) list.append(element('dt', key), element('dd'));
    $('inspector').replaceChildren(list);
  }
  values.forEach(([, value], index) => { const cell = list.children[index * 2 + 1]; if (cell.textContent !== value) cell.textContent = value; });
  $('selection-hint').textContent = `#${id + 1} · ${species.name} · ${bonds} bonds · E ${lastFrame.energies[id].toFixed(1)}`; $('selection-hint').hidden = false;
}
function colorKey() {
  const gradient = settings.energyGradient > 0 && settings.energyInput > 0 ? ' With a supply gradient, the amber +X boundary is richer and the blue −X boundary is poorer.' : '';
  $('color-key').textContent = ($('color-mode').value === 'energy' ? 'Energy: blue / empty → warm / full (0–10). Stored energy powers activity and reactions.' : $('color-mode').value === 'cluster' ? 'Each bonded component has a color. Free particles are gray; a merger or split can change component colors.' : 'Species colors match the population legend and the Species editor.') + gradient;
}
function setPaused(value) {
  paused = value; send({ type: 'pause', value });
  $('play').replaceChildren(document.createTextNode(value ? '▶ ' : 'Ⅱ '), element('span', value ? 'Resume' : 'Pause'));
  $('play').setAttribute('aria-label', value ? 'Resume simulation' : 'Pause simulation');
  $('status').replaceChildren(element('i'), document.createTextNode(value ? ' PAUSED' : ' RUNNING'));
}
function showTooltip(anchor) {
  if (!anchor?.dataset.help) return; hideTooltip(); tooltipAnchor = anchor;
  const tooltip = $('tooltip'); tooltip.textContent = anchor.dataset.help; tooltip.hidden = false; anchor.setAttribute('aria-describedby', 'tooltip');
  const rect = anchor.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, rect.left - box.width / 2))}px`;
  tooltip.style.top = `${rect.bottom + box.height + 14 < innerHeight ? rect.bottom + 10 : Math.max(12, rect.top - box.height - 10)}px`;
}
function hideTooltip() { tooltipAnchor?.removeAttribute('aria-describedby'); tooltipAnchor = null; $('tooltip').hidden = true; }

for (const [key, preset] of Object.entries(PRESETS)) { const option = element('option', preset.name); option.value = key; $('preset').append(option); }
$('chart-metric').querySelector('[value="diversity"]').textContent = 'Mixture diversity';
$('chart-metric').parentElement.append(helpButton('Mixture diversity is normalized Shannon entropy of the configured species counts: 0% means one species is present; 100% means equal counts of every configured species. It does not measure newly evolved species or biological complexity. Reaction rate counts conversions per simulation second over the last two seconds.', 'measurement interpretation'));
$('active-stat').title = 'Powered is the fraction of particles with propulsion and stored energy. Alignment is the heading agreement of all powered particles (0–100%), not a measure of bond stability.';
const researchDownload = element('a', 'Download research notes ↧', 'button secondary');
researchDownload.href = './RESEARCH.md'; researchDownload.download = 'protoform.ing-research.md';
document.querySelector('.source-list').after(researchDownload);
renderSettings();
const appearance = { particleScale: .72, bondWidth: 2.2 };
function renderAppearanceControls() {
  controls('appearance-controls', APPEARANCE_FIELDS, key => appearance[key], (key, value) => { appearance[key] = value; if (renderer) renderer[key] = value; });
}
renderAppearanceControls();
function luckySettings() {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  // Lucky restarts the world, so use the values currently selected in World,
  // including edits that have not yet been applied.
  return luckySettingsFor(settings, worldDraft, seed);
}
function randomizeModel() {
  if (!renderer || !worker) return;
  try {
    restart(false, 'New model rules sampled. Your view and playback settings are preserved.', luckySettings());
  } catch (error) { toast(error.message); }
}
$('lucky').addEventListener('click', randomizeModel);
try {
  renderer = new UniverseRenderer($('universe')); renderer.setSettings(settings);
  renderer.onCameraChange = syncCameraControls;
  syncCameraControls();
  renderer.onSelect = () => { updateInspector(); if (renderer.selectedId !== null) switchTab('view'); };
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'frame') {
      // A reset can be queued behind old frames. Return those buffers without
      // mixing previous-world statistics into the new experiment's history.
      if (pendingWorldRequest || data.generation < expectedGeneration) { recycleFrame(data); return; }
      const previous = heldFrame;
      lastFrame = heldFrame = data; renderer.update(data);
      if (data.stats) updateStats(data.stats); else updateInspector();
      recycleFrame(previous);
    }
    else if (data.type === 'settings' && ['init', 'reset', 'import'].includes(data.reason)) {
      if (data.requestId !== pendingWorldRequest) return;
      pendingWorldRequest = 0; expectedGeneration = data.generation; clearHistory();
      if (data.imported) {
        settings = data.settings; setPaused(true); renderSettings();
        toast(data.migration?.prunedBonds ? `Legacy experiment loaded and paused. Removed ${data.migration.prunedBonds} incompatible bonds.` : data.migration?.algorithmChanged ? 'Experiment loaded and paused. Its state is preserved; future steps use the updated simulation engine.' : 'Experiment loaded and paused.');
      }
    } else if (data.type === 'settings' && data.reason === 'sync') {
      if (pendingWorldRequest) return;
      settings = data.settings; renderSettings();
    } else if (data.type === 'export') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.snapshot)], { type: 'application/json' })), link = element('a');
      link.href = url; link.download = `protoform.ing-${settings.seed}-${data.snapshot.ticks}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Complete experiment saved to your downloads.');
    } else if (data.type === 'error') {
      if (data.requestId === pendingWorldRequest) pendingWorldRequest = 0;
      toast(data.message); if (['configure', 'reset'].includes(data.action)) send({ type: 'sync' });
    }
  };
  worker.onerror = () => { setPaused(true); $('scene-error').hidden = false; $('scene-error').textContent = 'The simulation worker stopped. Save your current experiment if possible, then reload the app.'; };
  send({ type: 'init', settings }); setPaused(paused); send({ type: 'visibility', value: !document.hidden });
} catch (error) {
  $('scene-error').hidden = false; $('scene-error').textContent = error.message; $('status').textContent = 'UNAVAILABLE';
  for (const id of ['play', 'step', 'reset', 'apply-world', 'new-seed', 'lucky', 'export-button', 'import-button']) $(id).disabled = true;
}
let lastTime = performance.now(), fpsStart = lastTime, frames = 0;
function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, .1); lastTime = time;
  if (!document.hidden && renderer) { renderer.draw(dt); frames++; if (time - fpsStart >= 1000) { $('fps').textContent = Math.round(frames * 1000 / (time - fpsStart)); frames = 0; fpsStart = time; } }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
document.addEventListener('visibilitychange', () => { send({ type: 'visibility', value: !document.hidden }); lastTime = performance.now(); fpsStart = lastTime; frames = 0; });
$('universe').addEventListener('webglcontextlost', event => { event.preventDefault(); setPaused(true); $('scene-error').hidden = false; $('scene-error').textContent = 'Graphics were interrupted. Save the experiment, then reload to restore the view.'; });
$('play').addEventListener('click', () => setPaused(!paused));
$('step').addEventListener('click', () => { setPaused(true); send({ type: 'step' }); });
$('reset').addEventListener('click', () => restart()); $('apply-world').addEventListener('click', () => restart(true)); $('apply-mixture').addEventListener('click', () => restart(true));
$('speed').addEventListener('change', () => send({ type: 'speed', value: Number($('speed').value) }));
$('seed').addEventListener('input', () => pending());
$('simulation-size').addEventListener('input', () => {
  const side = Number($('simulation-size').value);
  worldDraft.boxSize = side;
  const countField = WORLD_FIELDS.find(field => field.key === 'count');
  worldDraft.count = Math.max(countField.min, Math.min(countField.max, Math.round(worldSizeAnchor.count * (side / worldSizeAnchor.boxSize) ** 3 / countField.step) * countField.step));
  syncWorldDraftInputs(); syncSimulationSizeControl(); pending();
});
$('simulation-size').addEventListener('change', () => { worldSizeAnchor = { ...worldDraft }; syncSimulationSizeControl(); });
$('new-seed').addEventListener('click', () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; restart(true); });
$('preset').addEventListener('change', () => { if ($('preset').value === 'lucky') randomizeModel(); else { settings = { ...settingsFor($('preset').value, settings.count, settings.seed), boxSize: settings.boxSize }; restart(false, `${PRESETS[settings.preset].name} started.`); } });
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
  button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const tabs = [...document.querySelectorAll('[data-tab]')], index = tabs.indexOf(button); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; switchTab(tabs[next].dataset.tab); tabs[next].focus(); });
});
$('species-name').addEventListener('change', () => { const next = structuredClone(settings.species); next[selectedSpecies].name = $('species-name').value.trim() || `Species ${letter(selectedSpecies)}`; if (configure({ species: next })) { speciesTabs(); drawMatrix(); renderReactions(); } $('species-name').value = settings.species[selectedSpecies].name; });
$('species-color').addEventListener('input', () => { const next = structuredClone(settings.species); next[selectedSpecies].color = $('species-color').value; configure({ species: next }); speciesTabs(); drawMatrix(); });
function resizeSpecies(count, selectLast = false) {
  if (!Number.isInteger(count) || count < 2 || count > LIMITS.species) { toast(`Choose 2–${LIMITS.species} species.`); return; }
  const oldCount = settings.species.length; if (count === oldCount) return;
  const species = Array.from({ length: count }, (_, i) => settings.species[i] ?? { ...speciesDefaults(i), abundance: 20 });
  const matrix = Array(count * count).fill(0);
  for (let a = 0; a < count; a++) for (let b = 0; b < count; b++) matrix[a * count + b] = a < oldCount && b < oldCount ? settings.matrix[a * oldCount + b] : a === b ? .6 : 0;
  const reactions = settings.reactions.filter(rule => rule.from < count && rule.to < count && rule.catalyst < count);
  if (restart(true, `${count} species configured. World restarted.`, { ...settings, species, matrix, reactions }) && selectLast) { selectedSpecies = count - 1; renderSpecies(); }
}
$('add-species').addEventListener('click', () => resizeSpecies(settings.species.length + 1, true));
$('apply-species-count').addEventListener('click', () => resizeSpecies(Number($('species-count').value)));
$('species-search').addEventListener('input', speciesTabs);
$('species-select').addEventListener('change', () => { selectedSpecies = Number($('species-select').value); renderSpecies(); });
$('pair-search').addEventListener('input', drawMatrix);
$('pair-target').addEventListener('change', drawMatrix);
$('edit-pair').addEventListener('click', () => editPair(selectedSpecies, Number($('pair-target').value)));
$('remove-species').addEventListener('click', () => {
  const count = settings.species.length, index = selectedSpecies; if (count <= 2) return;
  const species = settings.species.filter((_, i) => i !== index); if (!species.some(item => item.abundance > 0)) { toast('Give another species a nonzero mixture weight first.'); return; }
  const matrix = []; for (let a = 0; a < count; a++) for (let b = 0; b < count; b++) if (a !== index && b !== index) matrix.push(settings.matrix[a * count + b]);
  const remap = i => i > index ? i - 1 : i;
  const reactions = settings.reactions.filter(rule => ![rule.from, rule.to, rule.catalyst].includes(index)).map(rule => ({ ...rule, from: remap(rule.from), to: remap(rule.to), catalyst: remap(rule.catalyst) }));
  restart(true, 'Species and its reaction rules removed. World restarted.', { ...settings, species, matrix, reactions });
});
$('add-reaction').addEventListener('click', () => {
  if (settings.reactions.length >= LIMITS.reactions) return;
  if (configure({ reactions: [...settings.reactions, { name: `Reaction ${settings.reactions.length + 1}`, from: selectedSpecies, to: (selectedSpecies + 1) % settings.species.length, catalyst: -1, rate: .5, activationEnergy: .2, energyCost: .5 }] })) {
    $('reaction-search').value = ''; reactionPage = Math.floor((settings.reactions.length - 1) / REACTION_PAGE_SIZE); renderReactions();
  }
});
$('reaction-search').addEventListener('input', () => { reactionPage = 0; renderReactions(); });
$('reaction-prev').addEventListener('click', () => { reactionPage = Math.max(0, reactionPage - 1); renderReactions(); });
$('reaction-next').addEventListener('click', () => { reactionPage++; renderReactions(); });
$('affinity').addEventListener('input', () => { const value = Number($('affinity').value), [a, b] = activePair, count = settings.species.length, matrix = [...settings.matrix]; matrix[a * count + b] = value; matrix[b * count + a] = value; configure({ matrix }); $('affinity-value').value = value.toFixed(2); fillRange($('affinity')); drawMatrix(); });
for (const mode of ['particles', 'bonds']) $(`view-${mode}`).addEventListener('click', () => { if (renderer) renderer.viewMode = mode; if (mode === 'bonds') { $('show-bonds').checked = true; if (renderer) renderer.showBonds = true; } for (const key of ['particles', 'bonds']) { $(`view-${key}`).classList.toggle('active', key === mode); $(`view-${key}`).setAttribute('aria-pressed', String(key === mode)); } updateBondNote(); });
$('show-bonds').addEventListener('change', () => { if (renderer) renderer.showBonds = $('show-bonds').checked; updateBondNote(); });
$('show-bounds').addEventListener('change', () => { if (renderer) renderer.showBounds = $('show-bounds').checked; });
$('color-mode').addEventListener('change', () => { if (renderer) renderer.colorMode = $('color-mode').value; colorKey(); });
$('chart-metric').addEventListener('change', drawChart);
$('clear-selection').addEventListener('click', () => renderer?.select(null));
function syncCameraControls() {
  if (!renderer) return;
  const fly = renderer.cameraMode === 'fly';
  $('camera-mode').value = fly ? 'fly' : 'orbit';
  $('camera-mode-label').textContent = fly ? 'Free flight' : 'Orbit';
  $('camera-speed').value = String(renderer.movementSpeed);
  $('rotate-camera').setAttribute('aria-pressed', String(renderer.autoRotate));
  $('rotate-camera').title = fly ? 'Automatic look around' : 'Automatic orbit';
  $('rotate-camera').setAttribute('aria-label', $('rotate-camera').title);
  document.querySelector('.camera-help').textContent = fly ? 'Drag to look · WASD to move · Q/E down/up' : 'Drag to orbit · Shift-drag to pan · Scroll to zoom';
}
$('camera-mode').addEventListener('change', () => renderer?.setCameraMode($('camera-mode').value));
$('camera-speed').addEventListener('change', () => { if (renderer) renderer.movementSpeed = Number($('camera-speed').value); });
$('focus-selection').addEventListener('click', () => { if (renderer?.focusSelected()) $('universe').focus({ preventScroll: true }); });
const cameraMoveButtons = [...document.querySelectorAll('[data-camera-move]')];
for (const button of cameraMoveButtons) {
  const start = () => { renderer?.startMovement(button.dataset.cameraMove); button.classList.add('active'); };
  const stop = () => { renderer?.stopMovement(button.dataset.cameraMove); button.classList.remove('active'); };
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); button.focus({ preventScroll: true }); button.setPointerCapture(event.pointerId); start();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(name, stop);
  button.addEventListener('keydown', event => { if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); if (!event.repeat) start(); } });
  button.addEventListener('keyup', event => { if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); stop(); } });
  button.addEventListener('contextmenu', event => event.preventDefault());
}
function stopCameraMovement() { renderer?.stopMovement(); cameraMoveButtons.forEach(button => button.classList.remove('active')); }
$('camera-controls').addEventListener('toggle', () => { if (!$('camera-controls').open) stopCameraMovement(); });
window.addEventListener('blur', stopCameraMovement);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCameraMovement(); });
$('reset-camera').addEventListener('click', () => renderer?.resetCamera());
$('rotate-camera').addEventListener('click', () => { if (renderer) { renderer.autoRotate = !renderer.autoRotate; syncCameraControls(); } });
$('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('chamber').requestFullscreen) await $('chamber').requestFullscreen(); else toast('Fullscreen is unavailable in this browser.'); } catch { toast('Fullscreen is unavailable in this browser.'); } });
const luckyHeaderContainer = $('lucky').parentElement;
const fullscreenDock = $('fullscreen-dock');
new ResizeObserver(() => {
  if (!fullscreenDock.hidden) $('chamber').style.setProperty('--fullscreen-dock-height', `${Math.ceil(fullscreenDock.getBoundingClientRect().height)}px`);
}).observe(fullscreenDock);
document.addEventListener('fullscreenchange', () => {
  const inChamber = document.fullscreenElement === $('chamber');
  (inChamber ? $('chamber') : luckyHeaderContainer).append($('lucky'));
  if (inChamber) {
    fullscreenDock.hidden = false;
    fullscreenDock.append($('observation-bar'), document.querySelector('.transport'));
  } else {
    $('bond-explanation').before(document.querySelector('.transport'), $('observation-bar'));
    fullscreenDock.hidden = true;
  }
});
$('about-button').addEventListener('click', () => $('about-dialog').showModal());
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
$('export-button').addEventListener('click', () => send({ type: 'export' })); $('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => { const file = $('import-file').files[0]; if (!file) return; try { if (file.size > 64_000_000) throw new Error('Experiment files must be smaller than 64 MB.'); send({ type: 'import', snapshot: JSON.parse(await file.text()) }); } catch (error) { toast(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message); } $('import-file').value = ''; });
document.addEventListener('pointerover', event => { const help = event.target.closest('.help'); if (help) showTooltip(help); });
document.addEventListener('pointerout', event => { if (event.target.closest('.help') && !event.target.closest('.help').contains(event.relatedTarget)) hideTooltip(); });
document.addEventListener('focusin', event => {
  if (!event.target.matches('.help')) return;
  const anchor = event.target;
  showTooltip(anchor);
  // Keyboard focus can scroll a nested control panel. Position the help after
  // that scroll has settled, since the scroll listener dismisses stale tooltips.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.activeElement === anchor) showTooltip(anchor);
  }));
});
document.addEventListener('focusout', event => { if (event.target.matches('.help')) hideTooltip(); });
document.addEventListener('click', event => { const help = event.target.closest('.help'); if (help) { event.preventDefault(); showTooltip(help); } else hideTooltip(); });
document.addEventListener('scroll', hideTooltip, true); window.addEventListener('resize', hideTooltip);
const controlsPanel = document.querySelector('.controls');
const siteHeader = document.querySelector('.header');
function sizeSiteHeader() {
  document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(siteHeader.getBoundingClientRect().height)}px`);
  sizeControlsPanel();
}
function sizeControlsPanel() {
  controlsPanel.style.setProperty('--controls-top', `${Math.max(siteHeader.getBoundingClientRect().height + 16, controlsPanel.getBoundingClientRect().top)}px`);
}
new ResizeObserver(sizeSiteHeader).observe(siteHeader);
window.addEventListener('scroll', sizeControlsPanel, { passive: true });
window.addEventListener('resize', sizeSiteHeader);
sizeSiteHeader();
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); if (event.target.closest('input,select,button,summary,dialog') || document.querySelector('dialog[open]') || !worker) return; if (event.code === 'Space') { event.preventDefault(); setPaused(!paused); } if (event.key === 'ArrowRight') { event.preventDefault(); setPaused(true); send({ type: 'step' }); } });
