// Familiar inspiration groups, deliberately mixing taxonomic ranks; see docs/animal-inspiration.md.
// legPairs guides the simplified CAD stance, not the animal's biological appendage count.
export const animalTypes = [
  {
    id: 'mammals', label: 'Mammals', fictional: false, legPairs: [0, 1, 2],
    traits: 'Fur or bare skin, whiskers, expressive ears, specialized teeth, paws or flippers. Explore gliders, burrowers, bats and whales as well as land mammals; avoid defaulting to a stocky quadruped.',
    habitats: 'Forest canopy, grassland, desert burrows, mountain ledges, freshwater margins or open ocean.',
  },
  {
    id: 'birds', label: 'Birds', fictional: false, legPairs: [1],
    traits: 'Feathers, beaks, wings, crests and specialized feet. Vary between diving, soaring, wading, ground-running and nocturnal forms; flightlessness is a valid adaptation.',
    habitats: 'Cliff nests, reed beds, forest canopy, tidal flats, polar coasts or open sky.',
  },
  {
    id: 'reptiles', label: 'Reptiles', fictional: false, legPairs: [0, 2],
    traits: 'Scales, scutes, shells, flexible jaws and heat-seeking or camouflage adaptations. Include sinuous legless snakes, armored turtles and climbing lizards rather than only bulky lizard bodies.',
    habitats: 'Sun-warmed rock, dunes, mangrove roots, riverbanks, rainforest branches or seagrass shallows.',
  },
  {
    id: 'amphibians', label: 'Amphibians', fictional: false, legPairs: [0, 2],
    traits: 'Moist skin, metamorphosis, adhesive toes, external gills in some forms and vivid warning colors. Include tailed salamanders, jumping frogs and burrowing legless caecilians.',
    habitats: 'Rain-soaked leaf litter, mossy stream banks, temporary pools, submerged roots or damp soil tunnels.',
  },
  {
    id: 'fish', label: 'Fish', fictional: false, legPairs: [0],
    traits: 'Fins, gills, scales or smooth skin, lateral sensing and unusual jaws. Draw from sharks, rays, eels, reef fish and deep-sea forms; bodies may be flattened, ribbon-like, transparent or streamlined.',
    habitats: 'Reef crevices, kelp forests, river channels, flooded caves, deep-sea water columns or silty seabeds.',
  },
  {
    id: 'insects', label: 'Insects', fictional: false, legPairs: [0, 3],
    traits: 'Segmented armor, compound eyes, antennae, specialized mouthparts and optional wings. Adult insect inspiration has six legs; legless larvae, metamorphosis, mimicry and social colonies offer other body plans.',
    habitats: 'Leaf undersides, hollow stems, bark crevices, soil nests, freshwater surfaces or night-blooming flowers.',
  },
  {
    id: 'arachnids', label: 'Spiders & scorpions', fictional: false, legPairs: [4],
    traits: 'Eight walking legs, sensory hairs, grasping mouthparts and either silk structures or enlarged pincers. Explore tiny mites, stalking hunters, trapdoor ambushers and long-legged forms as distinct possibilities.',
    habitats: 'Webs between branches, silk-lined burrows, under stones, desert cracks or damp forest litter.',
  },
  {
    id: 'crustaceans', label: 'Crabs & shrimp', fictional: false, legPairs: [3, 4],
    traits: 'Jointed shells, antennae, stalked eyes, claws, swimming paddles and molting. Include lobsters, isopods and attached barnacles; biological appendage counts may exceed the simplified CAD stance.',
    habitats: 'Tidal rock pools, sand burrows, mangrove channels, reef rubble, submerged timber or deep-sea sediment.',
  },
  {
    id: 'snails', label: 'Snails & slugs', fictional: false, legPairs: [0],
    traits: 'A gliding muscular foot rather than walking legs, tentacles and either a coiled shell or an exposed mantle. Sea-slug inspirations can carry ornate respiratory structures, bright defenses and translucent bodies.',
    habitats: 'Wet foliage, shaded stone, tide pools, algae-covered reefs, kelp blades or the open-water depths.',
  },
  {
    id: 'cephalopods', label: 'Octopuses & squid', fictional: false, legPairs: [0],
    traits: 'Flexible arms and tentacles, suckers, a beak, a mantle and jet propulsion. Explore camouflage, rippling fins, light organs and external shells; arms are not mammal-like walking legs.',
    habitats: 'Rock dens, coral rubble, kelp shadows, sandy seabeds, open ocean or the deep midwater.',
  },
  {
    id: 'bivalves', label: 'Clams & oysters', fictional: false, legPairs: [0],
    traits: 'Paired hinged shells around a soft mantle, siphons and filter-feeding surfaces. Burrowing, anchoring or swimming by shell-clapping can replace a head-and-legs layout.',
    habitats: 'Half-buried in sand or mud, clustered on rocks and roots, among reef rubble or on submerged pilings.',
  },
  {
    id: 'jellyfish', label: 'Jellyfish', fictional: false, legPairs: [0],
    traits: 'Gelatinous bells, trailing tentacles, radial forms, transparency and pulsating motion. Comb-jelly inspiration may add shimmering ciliary rows; these are a separate lineage, not stinging jellyfish.',
    habitats: 'Sunlit coastal water, sheltered bays, plankton layers, dark midwater or beneath sea ice.',
  },
  {
    id: 'corals', label: 'Corals & anemones', fictional: false, legPairs: [0],
    traits: 'Tentacled polyps, radial mouths, retractile crowns and optional colonies sharing a branching or encrusting body. Treat the organism as an animal attached to its environment, not as a decorative plant.',
    habitats: 'Reef ledges, rock fissures, tide pools, current-swept walls or cold deep-sea gardens.',
  },
  {
    id: 'echinoderms', label: 'Starfish & urchins', fictional: false, legPairs: [0],
    traits: 'Radial organization, tube feet, spines, branching arms or a sea-cucumber body. Explore regeneration and hydraulic movement; tiny tube feet and radial arms are distinct from paired walking legs.',
    habitats: 'Rocky shores, kelp beds, sand flats, coral crevices or the deep seafloor.',
  },
  {
    id: 'worms', label: 'Worms', fictional: false, legPairs: [0],
    traits: 'Elongated, ribbon-like or segmented bodies without jointed walking legs. Options include bristles, retractile jaws, feeding fans, protective tubes and undulating swimming; worms are several different animal lineages.',
    habitats: 'Damp soil, submerged wood, sediment burrows, reef tubes, deep-sea vents or open-water layers.',
  },
  {
    id: 'sponges', label: 'Sponges', fictional: false, legPairs: [0],
    traits: 'Porous animal bodies with pumping channels, branching towers, cups or encrusting mats. Usually attached filter feeders; some deep-sea relatives instead trap small prey. A face and limbs are unnecessary.',
    habitats: 'Reef overhangs, submerged caves, current-washed rocks or deep-sea slopes.',
  },
  {
    id: 'sky-drifters', label: 'Sky drifters', fictional: true, legPairs: [0],
    traits: 'Invented atmospheric animals with buoyancy chambers, steering membranes, dangling sensory filaments and living ballast. Give the floating anatomy a coherent feeding and reproductive ecology.',
    habitats: 'Cloud forests, storm fronts, warm updrafts above canyons or dense alien atmospheres.',
  },
  {
    id: 'dream-mimics', label: 'Dream mimics', fictional: true, legPairs: [0, 1, 2, 3, 4],
    traits: 'Invented animals whose organs, false faces or nested body outlines exploit another species\' perception. Use asymmetric anatomy, optical camouflage or convincing decoys with a biological purpose.',
    habitats: 'Fog-filled wetlands, dim forests, reflective cave pools or twilight reef labyrinths.',
  },
];

export const animalTypeIds = animalTypes.map(({ id }) => id);
export const animalTypeById = Object.fromEntries(animalTypes.map(type => [type.id, type]));
