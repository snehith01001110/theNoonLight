// Category classification + normalization, ported from the root site.
import { RAW, AGE, PRESENT_YEAR } from './events-raw.js';
export { AGE, PRESENT_YEAR };

const CATS = {
  cosmos: { label: "Cosmos",           rgb: [110, 168, 255] }, // blue
  planet: { label: "Earth & planets",  rgb: [224, 163,  78] }, // amber
  life:   { label: "Life & evolution", rgb: [ 95, 214, 138] }, // green
  human:  { label: "Human origins",    rgb: [201, 139, 255] }, // violet
  civ:    { label: "Civilization",     rgb: [255, 123, 107] }, // coral
  tech:   { label: "Science & tech",   rgb: [ 79, 216, 208] }, // teal
};
const CAT_ORDER = Object.keys(CATS);

// Each event is auto-assigned a category from keyword signals anchored by
// era (the timeline is chronological, so time carries most of the weight),
// with an explicit override table for the handful of keyword misfires.
const KW = {
  cosmos: ['big bang','inflation','antimatter','antiproton','quark','nucleosynthesis','cosmic microwave','cmb','first light','dark ages','cosmic dawn','cosmic noon','supernova','quasar','galaxy','galaxies','galactic','milky way','globular','nebula','reionization','dark energy','dark matter','black hole','neutron star','pulsar','cosmic web','the universe','expansion of the universe','interstellar medium','star cluster','starburst','gamma-ray burst','white dwarf','red giant','magellanic','andromeda','local group','helium','hydrogen fuse'],
  planet: ['sun ignites','protoplanetary','solar nebula','solar system','jupiter','saturn','planetesimal','asteroid','comet','bombardment','meteor','iron core','mantle','first atmosphere','crust','zircon','rock','gneiss','oldest crystal','sedimentary','plate tectonic','continent','supercontinent','rodinia','nuna','columbia','pangaea','pannotia','gondwana','laurasia','glaciation','snowball earth','sturtian','marinoan','gaskiers','huronian','glacier','ozone layer','banded iron','impact crater','crater','volcan','magnetic field','magnetic shield','archean','proterozoic','hadean','phanerozoic','oxygen floods','great oxidation','oceans gain oxygen','glacial','ice age','ice sheet','isthmus','land bridge','salinity','sea dries','poles reverse','magnetic flip','tectonic','moon forms','theia','atlantic opens','ocean opens','rift','heat spike','hyperthermal','boring billion','methane','carbon cycle'],
  life: ['luca','last universal','stromatolite','cyanobacteria','photosynthesis','eukaryot','prokaryot','mitochondria','multicellular','sexual reproduction','fungi','biota','ediacaran','avalon','dickinsonia','kimberella','bilaterian','skeleton','cambrian','trilobite','vertebrate','jawless','fish','ostracoderm','placoderm','plants colonize','land plant','moss','forest','tree','tetrapod','amphibian','reptile','amniote','synapsid','dinosaur','archosaur','pterosaur','mammal','marsupial','placental','bird','archaeopteryx','feather','flowering plant','angiosperm','insect','arthropod','crinoid','coral','reef','ammonite','mollusk','mass extinction','extinction','great dying','permian','triassic','jurassic','cretaceous','devonian','ordovician','silurian','carboniferous','k-pg','k–pg','chicxulub','primate','monkey','ape','hominoid','whale','cetacean','grass','savanna','photosynth','oxygenic','biosphere','evolv','species','genus','fossil','microbe','bacteria','algae','megafauna','ground sloth','megatherium','cave bear','megaloceros','giant deer','glyptodont','mammoth','mastodon','woolly','diprotodon','marsupial lion','giant marsupial','flightless bird','moa','smilodon','sabertooth','saber-tooth'],
  human: ['hominin','hominid','australopith','ardipithecus','sahelanthropus','orrorin','paranthropus','lucy','homo habilis','homo erectus','homo ergaster','homo sapiens','neanderthal','denisovan','floresiensis','naledi','genus homo','human line','human lineage','stone tool','oldowan','acheulean','handaxe','control of fire','learn to control fire','hearth','cooking','symbolic thought','ochre','beads','jewelry','cave paint','chauvet','lascaux','rock art','venus figurine','out of africa','beringia','peopling','first americans','clovis','last glacial maximum','ice age ends','holocene begins','holocene','hunter-gather','foraging','bipedal','brain size'],
  civ: ['göbekli','gobekli','agriculture','farming','neolithic','domesticat','first town','first city','cities','jericho','çatalhöyük','catalhoyuk','the wheel','pottery','bronze age','iron age','copper','writing','cuneiform','hieroglyph','pyramid','stonehenge','ziggurat','hammurabi','code of','law code','empire','dynasty','pharaoh','mesopotamia','sumer','babylon','assyria','egypt','indus','shang','zhou','qin','han dynasty','maya','aztec','inca','rome','roman','greek','athens','sparta','democracy','republic','caesar','augustus','alexander','persia','carthage','buddha','confucius','christianity','jesus','islam','muhammad','caliphate','crusade','feudal','middle ages','black death','plague','mongol','genghis','ottoman','renaissance','reformation','colon','slave trade','revolution','independence','constitution','napoleon','war','battle','treaty','empire falls','fall of','united nations','cold war','genocide','pandemic','covid','ceasefire','election','president','monarch','king','queen','trade route','silk road','city-state','civil war','world war'],
  tech: ['printing press','gutenberg','movable type','telescope','microscope','heliocentr','copernicus','galileo','kepler','newton','principia','calculus','scientific method','steam engine','industrial revolution','spinning','factory','electricity','telegraph','telephone','radio','light bulb','electric light','photograph','powered flight','wright brothers','wright flyer','aviation','aircraft','automobile','internal combustion','assembly line','relativity','einstein','quantum','periodic table','x-ray','radioactiv','natural selection','darwin','origin of species','genetics','mendel','dna','double helix','genome','crispr','gene edit','clon','vaccine','vaccination','penicillin','antibiotic','anesthesia','germ theory','pasteur','polio','smallpox','ebola','mrna','heart transplant','surgery','medicine','nuclear','atomic bomb','fission','nuclear fusion','transistor','microprocessor','microchip','integrated circuit','semiconductor','computer','computing','turing','universal machine','algorithm','software','internet','world wide web','arpanet','www','google','wikipedia','facebook','bitcoin','satellite','sputnik','space age','rocket','apollo','moon landing','lands on the moon','lunar','space station','space shuttle','voyager','space probe','mars rover','curiosity rover','hubble','webb telescope','james webb','starship','crew dragon','spacecraft','reaches orbit','smartphone','iphone','mobile phone','personal computer','eniac','artificial intelligence','machine learning','large language model','neural network','alphago','deep blue','laser','superconduct','higgs','boson','gravitational wave','plate tectonics','big bang confirmed','black hole image','sound barrier','test-tube baby','in vitro','cloned','cloning','golden gate bridge','genome sequenc','dna sequenc','pluto is demoted','discover','steam','railway','railroad','engine','electric','electromag','magnet','battery','balloon','observatory','oxygen','chemical revolution','dynamite','phonograph','bessemer','cotton gin','electron','neutron','radium','nucleus','induction','periodic','anatomy','blood circulation','vaccin','locomotive','steamboat','optics','experiment'],
};
const OVERRIDES = {
  "Napoleon invades Egypt":"civ", "Rosetta Stone discovered":"civ", "California Gold Rush":"civ",
  "Tutankhamun's tomb discovered":"civ", "Collapse of the Soviet Union":"civ", "Assyria's war machine":"civ",
  "Writing invented":"civ", "Farming in New Guinea":"civ", "The Montreal Protocol":"civ", "The Appian Way begun":"civ",
  "Linnaeus classifies life":"tech", "Maori reach New Zealand":"civ",
  "Mediterranean nearly dries up":"planet", "The Mediterranean refills":"planet",
  "Polynesians settle Hawaii":"civ", "Gunpowder formulas recorded":"tech",
  "Al-Khwarizmi's algebra":"tech", "Omar Khayyam's mathematics":"tech", "Euclid's Elements":"tech",
  "Aryabhata's astronomy":"tech", "Babylonian mathematics":"tech",
  "Titanosaurs dominate":"life", "The Messel Pit world":"life", "Ruminants spread widely":"life",
  "Lystrosaurus dominates":"life", "Siberian Traps erupt":"planet", "Chicxulub asteroid impact":"planet",
};
const kwHas = (s, arr) => arr.some(w => s.includes(w));
function classify(ev){
  if (OVERRIDES[ev.title]) return OVERRIDES[ev.title];
  const s = (ev.title + ' ' + ev.desc).toLowerCase();
  const ya = AGE - ev.t;
  if (ya > 4.6e9) return 'cosmos';               // before the Sun: cosmology
  if (ya <= 12000){                              // farming onward: civ, tech on a clear signal
    if (kwHas(s, KW.tech)) return 'tech';
    return 'civ';
  }
  if (ya <= 7.2e6){                              // human prehistory
    if (kwHas(s, KW.human)) return 'human';
    if (kwHas(s, KW.life)) return 'life';
    if (kwHas(s, KW.planet)) return 'planet';
    return 'human';
  }
  // deep time: geology vs biology (the &&!life guard keeps biology out of planet)
  if (kwHas(s, KW.planet) && !kwHas(s, KW.life)) return 'planet';
  if (kwHas(s, KW.life)) return 'life';
  if (kwHas(s, KW.cosmos)) return 'cosmos';
  if (kwHas(s, KW.planet)) return 'planet';
  return ya > 3.9e9 ? 'planet' : 'life';   // before life existed, default to planet
}
// ── eras: one table drives the readout, modal, grid labels, ticks & bubble ──
// [years-ago the era begins, name] — coarse chapters of the cosmic story
const ERAS = [
  [13.787e9, "the big bang"],
  [13.6e9,   "first stars"],
  [13.2e9,   "the age of galaxies"],
  [4.6e9,    "the Sun & Earth form"],
  [3.8e9,    "first life"],
  [2e9,      "complex cells"],
  [635e6,    "first animals"],
  [252e6,    "age of dinosaurs"],
  [66e6,     "age of mammals"],
  [2.5e6,    "the human story"],
  [12e3,     "civilization"],
];
function eraOf(ya){
  for (let i = ERAS.length - 1; i >= 0; i--) if (ya <= ERAS[i][0]) return ERAS[i][1];
  return ERAS[0][1];
}

export { CATS, CAT_ORDER, ERAS, eraOf, classify };

export const EVENTS = RAW.map(e => {
  let t;
  if (e.t !== undefined) t = e.t;
  else if (e.ya !== undefined) t = AGE - e.ya;
  else t = AGE - (PRESENT_YEAR - e.ce);
  const ev = { t, ya: AGE - t, title: e.title, desc: e.desc };
  ev.c = classify(ev);
  return ev;
}).sort((a, b) => a.t - b.t);
