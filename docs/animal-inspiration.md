# Animal inspiration groups

The generator uses 16 familiar animal groups and two explicitly fictional additions. These are
creative selection buckets rather than a taxonomy lesson: classes, phyla and everyday names are
mixed intentionally. The Smithsonian's vertebrate divisions support the familiar mammals, birds,
reptiles, amphibians and fish grouping. Marine groups are split further so a squid, clam, sponge or
coral can start from its own anatomy instead of receiving a generic reptile body.
([Smithsonian Vertebrate Zoology](https://naturalhistory.si.edu/research/vertebrate-zoology),
[Monterey Bay Aquarium animal guide](https://www.montereybayaquarium.org/animals))

## Catalog

`shared/animal-types.mjs` owns the stable IDs, visible labels, physical inspiration, habitat options,
fictional flags and simplified CAD stance suggestions. Features are options, not a requirement to
combine every listed structure in one animal.

| Label | Biological starting point |
|---|---|
| Mammals | Hair, skin, whiskers, teeth, paws or flippers; terrestrial, aerial and aquatic forms. |
| Birds | Feathers, wings, beaks and specialized feet; flight is optional. |
| Reptiles | Scales, shells and flexible bodies, including legless snakes. |
| Amphibians | Moist skin, metamorphosis and aquatic/terrestrial life stages, including legless caecilians. |
| Fish | Fins, gills and widely different body profiles; includes sharks, rays and eels. |
| Insects | Adult six-legged body plans, wings or winglessness, and radically different larval forms. |
| Spiders & scorpions | Arachnid legs, mouthparts, sensing structures, silk or pincers. |
| Crabs & shrimp | Crustacean shells, jointed appendages, antennae, claws and paddles; also barnacles and isopods. |
| Snails & slugs | Gastropod shells or exposed mantles, a gliding foot and elaborate sea-slug forms. |
| Octopuses & squid | Cephalopod arms, tentacles, mantles, jets and camouflage; includes cuttlefish and nautiluses. |
| Clams & oysters | Bivalve shells, siphons, mantles and burrowing or attached lives. |
| Jellyfish | Gelatinous drifting forms; comb jellies may inspire a design but are a different phylum. |
| Corals & anemones | Attached polyps, tentacled crowns and solitary or colonial animals. |
| Starfish & urchins | Echinoderm radial forms, spines and tube feet; includes sea cucumbers. |
| Worms | Several unrelated elongated animal groups, including segmented worms and flatworms. |
| Sponges | Porous, pumping or prey-trapping animal bodies; no face or legs required. |
| Sky drifters | Fictional buoyant atmospheric animals. |
| Dream mimics | Fictional animals with perception-confusing anatomy and biological decoys. |

## Trait references

- Legless vertebrates are real starting points, not just a fantasy exception. Caecilians belong to
  amphibians even though their elongated bodies superficially resemble worms.
  ([Smithsonian aquatic caecilian](https://www.nationalzoo.si.edu/animals/aquatic-caecilian))
- Jointed armor and segmented appendages connect the arthropod inspirations. Adult insects and
  spiders retain different ordinary leg counts; they are not interchangeable categories.
  ([AMNH Arthropods](https://www.amnh.org/explore/ology/biodiversity/tree-of-life/arthropods),
  [AMNH Entomology](https://www.amnh.org/explore/ology/entomology/what-is-entomology),
  [AMNH spider anatomy](https://www.amnh.org/research/science-conservation/projects/case-studies/spiders))
- Snails, bivalves and cephalopods are mollusks, but separating them exposes strongly different
  silhouettes. Cephalopods offer arms, camouflage and shell variation; nudibranchs add exposed
  respiratory structures and defensive coloration.
  ([Smithsonian Cephalopods](https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives),
  [Smithsonian Nudibranchs](https://ocean.si.edu/ocean-life/invertebrates/collage-nudibranch-colors))
- Bivalves provide shells, mantles, filter-feeding anatomy, burrowing feet and attached forms without
  requiring a conventional face or legs.
  ([Smithsonian Shells](https://ocean.si.edu/ecosystems/shells-story),
  [NOAA Bivalves](https://oceanservice.noaa.gov/facts/bivalve.html))
- Jellyfish and comb jellies belong to different phyla. Corals are animals, and their polyp bodies
  offer solitary or colonial alternatives to a torso with a head.
  ([Smithsonian Jellies](https://ocean.si.edu/ocean-life/invertebrates/jellyfish-and-comb-jellies),
  [Smithsonian Corals](https://ocean.si.edu/ocean-life/invertebrates/corals-and-coral-reefs))
- Echinoderm tube feet provide movement without paired walking legs. Marine segmented worms
  supply bristles, feeding fans, protective tubes and swimming adaptations.
  ([Smithsonian Echinoderms](https://ocean.si.edu/ocean-life/invertebrates/sea-stars-urchins-and-relatives),
  [Smithsonian Polychaetes](https://ocean.si.edu/ocean-life/invertebrates/pops-polychaete-color))
- Sponges pump water through their bodies; some deep-sea forms instead capture small prey.
  ([Smithsonian Sponges](https://ocean.si.edu/ocean-life/invertebrates/what-makes-sponges-grow),
  [Smithsonian Deep-sea Sponges](https://ocean.si.edu/ecosystems/coral-reefs/describing-new-deep-sea-corals-and-sponges))

The fictional additions are product inventions, not claims about known animals. Habitat suggestions
are broad starting points; generated traits, movement and the actual scene must agree with the
chosen environment.

## Legs and print interpretation

`legPairs` contains permitted starting stances for the existing simplified CAD recipe (zero through
four pairs). It is not a biological census or a limit for unrestricted generation. A crab can have
more appendages than the CAD model, while an octopus has arms and a sea star has tube feet without
either needing mammal-like legs. Zero is an intentional option for naturally legless groups, and
other groups can lose legs through an explicit user request or speculative adaptation.
