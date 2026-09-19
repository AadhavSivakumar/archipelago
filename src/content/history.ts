/**
 * The Historical Habitat's timeline.
 *
 * Sixty-odd events, chosen for the same reason a museum picks what goes in a
 * single hall: not "everything that mattered" but the smallest set that tells
 * the shape of the story, from the first farms to the pandemic. It leans away
 * from a single continent on purpose — Tang, the Abbasids, Mansa Musa,
 * Tenochtitlan, the Mughals, Meiji, the Year of Africa — because a timeline
 * of the human past that stops at the Mediterranean is a timeline of half of
 * it.
 *
 * Years are numbers so they sort; negative is BCE. `article` is the Wikipedia
 * title the corner card fetches, which is why some differ from the label —
 * the card wants the encyclopedia's own name for the thing.
 */
export type HistoricEvent = { year: number; label: string; article: string }

export type Era =
  | 'prehistory'
  | 'ancient'
  | 'classical'
  | 'medieval'
  | 'earlyModern'
  | 'modern'
  | 'contemporary'

export const ERAS: Record<Era, { name: string; color: string; from: number }> = {
  prehistory: { name: 'Prehistory', color: '#8a7a5a', from: -Infinity },
  ancient: { name: 'Ancient world', color: '#c8a15a', from: -3000 },
  classical: { name: 'Classical antiquity', color: '#d9c48a', from: -800 },
  medieval: { name: 'Middle Ages', color: '#7a8fa6', from: 500 },
  earlyModern: { name: 'Early modern', color: '#8fb0a0', from: 1450 },
  modern: { name: 'Modern era', color: '#c97a63', from: 1789 },
  contemporary: { name: 'Contemporary', color: '#e8a06a', from: 1945 },
}

export function eraOf(year: number): Era {
  let era: Era = 'prehistory'
  for (const [id, e] of Object.entries(ERAS) as [Era, { from: number }][]) {
    if (year >= e.from) era = id
  }
  return era
}

/** "3300 BCE", "476", "1969". */
export function yearLabel(year: number) {
  return year < 0 ? `${-year} BCE` : String(year)
}

export const EVENTS: readonly HistoricEvent[] = [
  { year: -10000, label: 'Farming begins', article: 'Neolithic Revolution' },
  { year: -3300, label: 'Writing emerges in Sumer', article: 'History of writing' },
  { year: -3100, label: 'Egypt is unified', article: 'Narmer' },
  { year: -2600, label: 'Cities of the Indus flourish', article: 'Indus Valley Civilisation' },
  { year: -2560, label: 'The Great Pyramid is built', article: 'Great Pyramid of Giza' },
  { year: -1754, label: 'The Code of Hammurabi', article: 'Code of Hammurabi' },
  { year: -1200, label: 'The Bronze Age collapses', article: 'Late Bronze Age collapse' },
  { year: -776, label: 'The first Olympic Games', article: 'Ancient Olympic Games' },
  { year: -508, label: 'Democracy in Athens', article: 'Athenian democracy' },
  { year: -500, label: 'The Buddha and Confucius teach', article: 'Axial Age' },
  { year: -331, label: 'Alexander defeats Persia', article: 'Battle of Gaugamela' },
  { year: -221, label: 'Qin unifies China', article: 'Qin Shi Huang' },
  { year: -27, label: 'Rome becomes an empire', article: 'Augustus' },
  { year: 105, label: 'Paper is made in Han China', article: 'Cai Lun' },
  { year: 476, label: 'The Western Roman Empire falls', article: 'Fall of the Western Roman Empire' },
  { year: 618, label: 'The Tang dynasty is founded', article: 'Tang dynasty' },
  { year: 622, label: 'The Hijra', article: 'Hijrah' },
  { year: 800, label: 'Charlemagne is crowned', article: 'Charlemagne' },
  { year: 830, label: 'The House of Wisdom in Baghdad', article: 'House of Wisdom' },
  { year: 1000, label: 'The Norse reach North America', article: "L'Anse aux Meadows" },
  { year: 1054, label: 'The Great Schism', article: 'East–West Schism' },
  { year: 1088, label: 'The first university, at Bologna', article: 'University of Bologna' },
  { year: 1206, label: 'Genghis Khan unites the Mongols', article: 'Genghis Khan' },
  { year: 1215, label: 'Magna Carta', article: 'Magna Carta' },
  { year: 1324, label: "Mansa Musa's pilgrimage", article: 'Mansa Musa' },
  { year: 1325, label: 'Tenochtitlan is founded', article: 'Tenochtitlan' },
  { year: 1347, label: 'The Black Death reaches Europe', article: 'Black Death' },
  { year: 1440, label: "Gutenberg's printing press", article: 'Johannes Gutenberg' },
  { year: 1453, label: 'Constantinople falls', article: 'Fall of Constantinople' },
  { year: 1492, label: 'Columbus crosses the Atlantic', article: 'Voyages of Christopher Columbus' },
  { year: 1517, label: "Luther's Ninety-five Theses", article: 'Ninety-five Theses' },
  { year: 1526, label: 'The Mughal Empire is founded', article: 'Mughal Empire' },
  { year: 1543, label: 'Copernicus moves the Earth', article: 'De revolutionibus orbium coelestium' },
  { year: 1687, label: "Newton's Principia", article: 'Philosophiæ Naturalis Principia Mathematica' },
  { year: 1760, label: 'The Industrial Revolution begins', article: 'Industrial Revolution' },
  { year: 1776, label: 'American independence is declared', article: 'United States Declaration of Independence' },
  { year: 1789, label: 'The French Revolution', article: 'French Revolution' },
  { year: 1804, label: 'Haiti wins its independence', article: 'Haitian Revolution' },
  { year: 1859, label: 'On the Origin of Species', article: 'On the Origin of Species' },
  { year: 1865, label: 'Slavery is abolished in the US', article: 'Thirteenth Amendment to the United States Constitution' },
  { year: 1868, label: 'The Meiji Restoration', article: 'Meiji Restoration' },
  { year: 1876, label: 'The telephone', article: 'Alexander Graham Bell' },
  { year: 1879, label: 'The electric light bulb', article: 'Incandescent light bulb' },
  { year: 1903, label: 'The first powered flight', article: 'Wright Flyer' },
  { year: 1905, label: 'Special relativity', article: 'Annus mirabilis papers' },
  { year: 1914, label: 'The First World War begins', article: 'World War I' },
  { year: 1917, label: 'The Russian Revolution', article: 'Russian Revolution' },
  { year: 1928, label: 'Penicillin is discovered', article: 'Penicillin' },
  { year: 1939, label: 'The Second World War begins', article: 'World War II' },
  { year: 1945, label: 'The war ends; the UN is founded', article: 'United Nations' },
  { year: 1947, label: 'India and Pakistan become independent', article: 'Partition of India' },
  { year: 1948, label: 'The Universal Declaration of Human Rights', article: 'Universal Declaration of Human Rights' },
  { year: 1949, label: "The People's Republic of China", article: "Proclamation of the People's Republic of China" },
  { year: 1953, label: 'The structure of DNA', article: 'Nucleic acid double helix' },
  { year: 1957, label: 'Sputnik', article: 'Sputnik 1' },
  { year: 1960, label: 'The Year of Africa', article: 'Year of Africa' },
  { year: 1969, label: 'Humans walk on the Moon', article: 'Apollo 11' },
  { year: 1971, label: 'The first microprocessor', article: 'Intel 4004' },
  { year: 1989, label: 'The Berlin Wall falls', article: 'Fall of the Berlin Wall' },
  { year: 1991, label: 'The World Wide Web goes public', article: 'World Wide Web' },
  { year: 1994, label: 'Apartheid ends', article: '1994 South African general election' },
  { year: 2001, label: 'The September 11 attacks', article: 'September 11 attacks' },
  { year: 2003, label: 'The human genome is sequenced', article: 'Human Genome Project' },
  { year: 2007, label: 'The iPhone', article: 'iPhone (1st generation)' },
  { year: 2020, label: 'The COVID-19 pandemic', article: 'COVID-19 pandemic' },
]
