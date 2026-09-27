/**
 * The Taxonomic Terraces: the ranks of biological classification, and a
 * dozen living things classified through all of them.
 *
 * Each species lists its lineage from domain to species. Taxa are shared by
 * name, so a human and a wolf share every rank down to Mammalia and part at
 * the order — which is the whole point of the visual: the terraces are the
 * ranks, and the branching is where two lineages stop sharing a name.
 *
 * Classifications follow the Wikipedia taxobox of each species. Two
 * conventions to know: plants have no formal phylum in most modern
 * treatments, so the vascular-plant clade Tracheophyta stands in that rank;
 * and bacteria were given kingdoms only in 2024, which is why E. coli's
 * kingdom is the unfamiliar Pseudomonadati.
 */
export const RANKS = ['Domain', 'Kingdom', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species'] as const

export const RANK_ARTICLES: Record<(typeof RANKS)[number], string> = {
  Domain: 'Domain (taxonomy)',
  Kingdom: 'Kingdom (biology)',
  Phylum: 'Phylum',
  Class: 'Class (biology)',
  Order: 'Order (biology)',
  Family: 'Family (taxonomy)',
  Genus: 'Genus',
  Species: 'Species',
}

/** One step of a lineage: the taxon's name and its Wikipedia title. */
export type Taxon = { name: string; article: string }

export type Organism = {
  common: string
  /** Domain first, species last: one per rank. */
  lineage: readonly Taxon[]
}

const t = (name: string, article = name): Taxon => ({ name, article })

const EUK = t('Eukarya', 'Eukaryote')
const ANIM = t('Animalia', 'Animal')
const CHORD = t('Chordata', 'Chordate')
const MAMM = t('Mammalia', 'Mammal')
const ARTH = t('Arthropoda', 'Arthropod')
const INS = t('Insecta', 'Insect')
const PLANT = t('Plantae', 'Plant')
const TRACH = t('Tracheophyta', 'Vascular plant')
const CARN = t('Carnivora')

/*
  Ordered so that lineages sit side by side round the terraces: the
  mammals together, then the other animals, then plants, fungi, bacteria.
  A shared taxon stands at the middle of the species it covers, so a
  contiguous run keeps every branch from crossing another.
*/
export const ORGANISMS: readonly Organism[] = [
  { common: 'Human', lineage: [EUK, ANIM, CHORD, MAMM, t('Primates', 'Primate'), t('Hominidae', 'Hominidae'), t('Homo'), t('Homo sapiens', 'Human')] },
  { common: 'Gray wolf', lineage: [EUK, ANIM, CHORD, MAMM, CARN, t('Canidae'), t('Canis'), t('Canis lupus', 'Wolf')] },
  { common: 'House cat', lineage: [EUK, ANIM, CHORD, MAMM, CARN, t('Felidae'), t('Felis'), t('Felis catus', 'Cat')] },
  { common: 'Blue whale', lineage: [EUK, ANIM, CHORD, MAMM, t('Artiodactyla', 'Even-toed ungulate'), t('Balaenopteridae', 'Rorqual'), t('Balaenoptera'), t('Balaenoptera musculus', 'Blue whale')] },
  { common: 'Bald eagle', lineage: [EUK, ANIM, CHORD, t('Aves', 'Bird'), t('Accipitriformes'), t('Accipitridae'), t('Haliaeetus', 'Sea eagle'), t('Haliaeetus leucocephalus', 'Bald eagle')] },
  { common: 'Great white shark', lineage: [EUK, ANIM, CHORD, t('Chondrichthyes'), t('Lamniformes', 'Mackerel shark'), t('Lamnidae'), t('Carcharodon'), t('Carcharodon carcharias', 'Great white shark')] },
  { common: 'Western honey bee', lineage: [EUK, ANIM, ARTH, INS, t('Hymenoptera'), t('Apidae'), t('Apis', 'Honey bee'), t('Apis mellifera', 'Western honey bee')] },
  { common: 'Monarch butterfly', lineage: [EUK, ANIM, ARTH, INS, t('Lepidoptera'), t('Nymphalidae'), t('Danaus', 'Danaus (butterfly)'), t('Danaus plexippus', 'Monarch butterfly')] },
  { common: 'English oak', lineage: [EUK, PLANT, TRACH, t('Magnoliopsida'), t('Fagales'), t('Fagaceae'), t('Quercus', 'Oak'), t('Quercus robur')] },
  { common: 'Rice', lineage: [EUK, PLANT, TRACH, t('Liliopsida', 'Monocotyledon'), t('Poales'), t('Poaceae'), t('Oryza'), t('Oryza sativa')] },
  { common: 'Fly agaric', lineage: [EUK, t('Fungi', 'Fungus'), t('Basidiomycota'), t('Agaricomycetes'), t('Agaricales'), t('Amanitaceae'), t('Amanita'), t('Amanita muscaria')] },
  { common: 'E. coli', lineage: [t('Bacteria'), t('Pseudomonadati'), t('Pseudomonadota'), t('Gammaproteobacteria'), t('Enterobacterales'), t('Enterobacteriaceae'), t('Escherichia'), t('Escherichia coli')] },
]

/** Every distinct taxon, with its rank, its parent, and the organisms under it. */
export type TaxonNode = {
  name: string
  article: string
  rank: number
  parent: number
  /** Indices into ORGANISMS. */
  members: number[]
}

export const TAXA: TaxonNode[] = (() => {
  const nodes: TaxonNode[] = []
  const byKey = new Map<string, number>()
  ORGANISMS.forEach((o, oi) => {
    let parent = -1
    o.lineage.forEach((taxon, rank) => {
      const key = `${rank}:${taxon.name}`
      let id = byKey.get(key)
      if (id === undefined) {
        id = nodes.length
        nodes.push({ name: taxon.name, article: taxon.article, rank, parent, members: [] })
        byKey.set(key, id)
      }
      nodes[id].members.push(oi)
      parent = id
    })
  })
  return nodes
})()
