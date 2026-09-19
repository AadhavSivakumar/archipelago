/**
 * The Historical Habitat's timeline.
 *
 * A hundred and forty-odd events, chosen for the same reason a museum picks what goes in a
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
  { year: -3500, label: 'The wheel', article: 'Wheel' },
  { year: -3300, label: 'Writing emerges in Sumer', article: 'History of writing' },
  { year: -3100, label: 'Egypt is unified', article: 'Narmer' },
  { year: -3000, label: 'Stonehenge is begun', article: 'Stonehenge' },
  { year: -2600, label: 'Cities of the Indus flourish', article: 'Indus Valley Civilisation' },
  { year: -2560, label: 'The Great Pyramid is built', article: 'Great Pyramid of Giza' },
  { year: -2334, label: 'Sargon builds the first empire', article: 'Sargon of Akkad' },
  { year: -1754, label: 'The Code of Hammurabi', article: 'Code of Hammurabi' },
  { year: -1600, label: 'The Shang dynasty rises', article: 'Shang dynasty' },
  { year: -1274, label: 'The Battle of Kadesh', article: 'Battle of Kadesh' },
  { year: -1200, label: 'The Bronze Age collapses', article: 'Late Bronze Age collapse' },
  { year: -1046, label: 'The Zhou dynasty', article: 'Zhou dynasty' },
  { year: -814, label: 'Carthage is founded', article: 'Carthage' },
  { year: -776, label: 'The first Olympic Games', article: 'Ancient Olympic Games' },
  { year: -753, label: 'Rome is founded', article: 'Founding of Rome' },
  { year: -550, label: 'Cyrus founds the Persian Empire', article: 'Cyrus the Great' },
  { year: -508, label: 'Democracy in Athens', article: 'Athenian democracy' },
  { year: -500, label: 'The Buddha and Confucius teach', article: 'Axial Age' },
  { year: -490, label: 'The Battle of Marathon', article: 'Battle of Marathon' },
  { year: -399, label: 'Socrates is put to death', article: 'Trial of Socrates' },
  { year: -331, label: 'Alexander defeats Persia', article: 'Battle of Gaugamela' },
  { year: -260, label: 'Ashoka turns to Buddhism', article: 'Ashoka' },
  { year: -221, label: 'Qin unifies China', article: 'Qin Shi Huang' },
  { year: -218, label: 'Hannibal crosses the Alps', article: "Hannibal's crossing of the Alps" },
  { year: -146, label: 'Rome destroys Carthage', article: 'Third Punic War' },
  { year: -44, label: 'Julius Caesar is assassinated', article: 'Assassination of Julius Caesar' },
  { year: -27, label: 'Rome becomes an empire', article: 'Augustus' },
  { year: 79, label: 'Vesuvius buries Pompeii', article: 'Eruption of Mount Vesuvius in 79 AD' },
  { year: 105, label: 'Paper is made in Han China', article: 'Cai Lun' },
  { year: 250, label: 'The Maya cities flourish', article: 'Maya civilization' },
  { year: 313, label: 'Rome tolerates Christianity', article: 'Edict of Milan' },
  { year: 410, label: 'Rome is sacked', article: 'Sack of Rome (410)' },
  { year: 476, label: 'The Western Roman Empire falls', article: 'Fall of the Western Roman Empire' },
  { year: 618, label: 'The Tang dynasty is founded', article: 'Tang dynasty' },
  { year: 622, label: 'The Hijra', article: 'Hijrah' },
  { year: 711, label: 'The Umayyads cross into Iberia', article: 'Umayyad conquest of Hispania' },
  { year: 800, label: 'Charlemagne is crowned', article: 'Charlemagne' },
  { year: 830, label: 'The House of Wisdom in Baghdad', article: 'House of Wisdom' },
  { year: 868, label: 'The oldest dated printed book', article: 'Diamond Sutra' },
  { year: 960, label: 'The Song dynasty', article: 'Song dynasty' },
  { year: 1000, label: 'The Norse reach North America', article: "L'Anse aux Meadows" },
  { year: 1054, label: 'The Great Schism', article: 'East–West Schism' },
  { year: 1066, label: 'The Norman conquest of England', article: 'Norman Conquest' },
  { year: 1088, label: 'The first university, at Bologna', article: 'University of Bologna' },
  { year: 1096, label: 'The First Crusade', article: 'First Crusade' },
  { year: 1206, label: 'Genghis Khan unites the Mongols', article: 'Genghis Khan' },
  { year: 1215, label: 'Magna Carta', article: 'Magna Carta' },
  { year: 1258, label: 'The Mongols sack Baghdad', article: 'Siege of Baghdad' },
  { year: 1271, label: 'Marco Polo sets out for China', article: 'Marco Polo' },
  { year: 1324, label: "Mansa Musa's pilgrimage", article: 'Mansa Musa' },
  { year: 1325, label: 'Tenochtitlan is founded', article: 'Tenochtitlan' },
  { year: 1347, label: 'The Black Death reaches Europe', article: 'Black Death' },
  { year: 1368, label: 'The Ming dynasty', article: 'Ming dynasty' },
  { year: 1405, label: "Zheng He's treasure fleet sails", article: 'Zheng He' },
  { year: 1438, label: 'The Inca Empire rises', article: 'Inca Empire' },
  { year: 1440, label: "Gutenberg's printing press", article: 'Johannes Gutenberg' },
  { year: 1453, label: 'Constantinople falls', article: 'Fall of Constantinople' },
  { year: 1492, label: 'Columbus crosses the Atlantic', article: 'Voyages of Christopher Columbus' },
  { year: 1498, label: 'Vasco da Gama reaches India', article: 'Vasco da Gama' },
  { year: 1517, label: "Luther's Ninety-five Theses", article: 'Ninety-five Theses' },
  { year: 1519, label: 'Magellan sets out around the world', article: 'Magellan expedition' },
  { year: 1521, label: 'Tenochtitlan falls to Cortés', article: 'Fall of Tenochtitlan' },
  { year: 1526, label: 'The Mughal Empire is founded', article: 'Mughal Empire' },
  { year: 1543, label: 'Copernicus moves the Earth', article: 'De revolutionibus orbium coelestium' },
  { year: 1600, label: 'The East India Company', article: 'East India Company' },
  { year: 1603, label: 'The Tokugawa shogunate', article: 'Tokugawa shogunate' },
  { year: 1610, label: 'Galileo sees the moons of Jupiter', article: 'Sidereus Nuncius' },
  { year: 1618, label: "The Thirty Years' War", article: "Thirty Years' War" },
  { year: 1644, label: 'The Qing dynasty', article: 'Qing dynasty' },
  { year: 1648, label: 'The Peace of Westphalia', article: 'Peace of Westphalia' },
  { year: 1687, label: "Newton's Principia", article: 'Philosophiæ Naturalis Principia Mathematica' },
  { year: 1712, label: 'The first steam engine', article: 'Newcomen atmospheric engine' },
  { year: 1757, label: 'Britain takes Bengal', article: 'Battle of Plassey' },
  { year: 1760, label: 'The Industrial Revolution begins', article: 'Industrial Revolution' },
  { year: 1776, label: 'American independence is declared', article: 'United States Declaration of Independence' },
  { year: 1789, label: 'The French Revolution', article: 'French Revolution' },
  { year: 1796, label: 'The first vaccine', article: 'Edward Jenner' },
  { year: 1804, label: 'Haiti wins its independence', article: 'Haitian Revolution' },
  { year: 1807, label: 'Britain abolishes the slave trade', article: 'Slave Trade Act 1807' },
  { year: 1810, label: 'Spanish America rises', article: 'Spanish American wars of independence' },
  { year: 1825, label: 'The first public railway', article: 'Stockton and Darlington Railway' },
  { year: 1839, label: 'The First Opium War', article: 'First Opium War' },
  { year: 1848, label: 'Revolutions across Europe', article: 'Revolutions of 1848' },
  { year: 1857, label: 'The Indian Rebellion', article: 'Indian Rebellion of 1857' },
  { year: 1859, label: 'On the Origin of Species', article: 'On the Origin of Species' },
  { year: 1861, label: 'The American Civil War begins', article: 'American Civil War' },
  { year: 1865, label: 'Slavery is abolished in the US', article: 'Thirteenth Amendment to the United States Constitution' },
  { year: 1868, label: 'The Meiji Restoration', article: 'Meiji Restoration' },
  { year: 1869, label: 'The Suez Canal opens', article: 'Suez Canal' },
  { year: 1871, label: 'Germany is unified', article: 'Unification of Germany' },
  { year: 1876, label: 'The telephone', article: 'Alexander Graham Bell' },
  { year: 1879, label: 'The electric light bulb', article: 'Incandescent light bulb' },
  { year: 1884, label: 'Europe partitions Africa', article: 'Berlin Conference' },
  { year: 1885, label: 'The first automobile', article: 'Benz Patent-Motorwagen' },
  { year: 1893, label: 'Women vote in New Zealand', article: "Women's suffrage in New Zealand" },
  { year: 1895, label: 'The cinema is born', article: 'Auguste and Louis Lumière' },
  { year: 1903, label: 'The first powered flight', article: 'Wright Flyer' },
  { year: 1905, label: 'Special relativity', article: 'Annus mirabilis papers' },
  { year: 1911, label: 'China ends two millennia of empire', article: '1911 Revolution' },
  { year: 1914, label: 'The First World War begins', article: 'World War I' },
  { year: 1917, label: 'The Russian Revolution', article: 'Russian Revolution' },
  { year: 1918, label: 'The influenza pandemic', article: 'Spanish flu' },
  { year: 1919, label: 'The Treaty of Versailles', article: 'Treaty of Versailles' },
  { year: 1922, label: "Tutankhamun's tomb is opened", article: 'Tomb of Tutankhamun' },
  { year: 1928, label: 'Penicillin is discovered', article: 'Penicillin' },
  { year: 1929, label: 'The Wall Street Crash', article: 'Wall Street crash of 1929' },
  { year: 1933, label: 'Hitler takes power', article: "Adolf Hitler's rise to power" },
  { year: 1939, label: 'The Second World War begins', article: 'World War II' },
  { year: 1945, label: 'The war ends; the UN is founded', article: 'United Nations' },
  { year: 1947, label: 'India and Pakistan become independent', article: 'Partition of India' },
  { year: 1947, label: 'The transistor', article: 'Transistor' },
  { year: 1948, label: 'The Universal Declaration of Human Rights', article: 'Universal Declaration of Human Rights' },
  { year: 1949, label: "The People's Republic of China", article: "Proclamation of the People's Republic of China" },
  { year: 1953, label: 'The structure of DNA', article: 'Nucleic acid double helix' },
  { year: 1955, label: 'The Montgomery bus boycott', article: 'Montgomery bus boycott' },
  { year: 1957, label: 'Sputnik', article: 'Sputnik 1' },
  { year: 1960, label: 'The Year of Africa', article: 'Year of Africa' },
  { year: 1961, label: 'The first human in space', article: 'Yuri Gagarin' },
  { year: 1962, label: 'The Cuban Missile Crisis', article: 'Cuban Missile Crisis' },
  { year: 1963, label: 'The March on Washington', article: 'March on Washington for Jobs and Freedom' },
  { year: 1966, label: 'The Cultural Revolution', article: 'Cultural Revolution' },
  { year: 1969, label: 'Humans walk on the Moon', article: 'Apollo 11' },
  { year: 1971, label: 'The first microprocessor', article: 'Intel 4004' },
  { year: 1973, label: 'The oil crisis', article: '1973 oil crisis' },
  { year: 1975, label: 'The Vietnam War ends', article: 'Fall of Saigon' },
  { year: 1978, label: 'The first IVF baby', article: 'Louise Brown' },
  { year: 1979, label: 'The Iranian Revolution', article: 'Iranian Revolution' },
  { year: 1986, label: 'Chernobyl', article: 'Chernobyl disaster' },
  { year: 1989, label: 'The Berlin Wall falls', article: 'Fall of the Berlin Wall' },
  { year: 1990, label: 'Nelson Mandela walks free', article: 'Nelson Mandela' },
  { year: 1991, label: 'The World Wide Web goes public', article: 'World Wide Web' },
  { year: 1991, label: 'The Soviet Union dissolves', article: 'Dissolution of the Soviet Union' },
  { year: 1994, label: 'Apartheid ends', article: '1994 South African general election' },
  { year: 1994, label: 'The Rwandan genocide', article: 'Rwandan genocide' },
  { year: 1997, label: 'Hong Kong returns to China', article: 'Handover of Hong Kong' },
  { year: 2001, label: 'The September 11 attacks', article: 'September 11 attacks' },
  { year: 2003, label: 'The human genome is sequenced', article: 'Human Genome Project' },
  { year: 2004, label: 'The Indian Ocean tsunami', article: '2004 Indian Ocean earthquake and tsunami' },
  { year: 2007, label: 'The iPhone', article: 'iPhone (1st generation)' },
  { year: 2008, label: 'The global financial crisis', article: '2008 financial crisis' },
  { year: 2010, label: 'The Arab Spring', article: 'Arab Spring' },
  { year: 2012, label: 'The Higgs boson is found', article: 'Higgs boson' },
  { year: 2015, label: 'The Paris Agreement', article: 'Paris Agreement' },
  { year: 2020, label: 'The COVID-19 pandemic', article: 'COVID-19 pandemic' },
  { year: 2022, label: 'Russia invades Ukraine', article: 'Russian invasion of Ukraine' },
  { year: 2022, label: 'Generative AI reaches the public', article: 'ChatGPT' },
]
