/**
 * The Artistic Arboretum: works of art, grouped by medium.
 *
 * "Most important" is not a fact, so this makes no claim to be a ranking. It
 * is the set a general reader would expect to find in a survey of each medium
 * — the works that other works are compared against — chosen so that each
 * group spans its medium's history rather than its last century. Literature
 * starts at Gilgamesh, architecture at Giza, games at Pac-Man.
 *
 * `year` is a string because "c. 1503", "8th century BCE" and "1882–" are all
 * honest answers that a number is not. `article` is the Wikipedia title the
 * corner card fetches; it disambiguates where the plain title would not.
 */
export type Artwork = { title: string; artist: string; year: string; article: string }

export type Medium = { id: string; name: string; color: string; works: readonly Artwork[] }

export const MEDIA: readonly Medium[] = [
  {
    id: 'painting',
    name: 'Painting',
    color: '#e79ad8',
    works: [
      { title: 'Mona Lisa', artist: 'Leonardo da Vinci', year: 'c. 1503', article: 'Mona Lisa' },
      { title: 'The Birth of Venus', artist: 'Sandro Botticelli', year: 'c. 1485', article: 'The Birth of Venus' },
      { title: 'The Night Watch', artist: 'Rembrandt', year: '1642', article: 'The Night Watch' },
      { title: 'Las Meninas', artist: 'Diego Velázquez', year: '1656', article: 'Las Meninas' },
      { title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', year: 'c. 1665', article: 'Girl with a Pearl Earring' },
      { title: 'The Great Wave off Kanagawa', artist: 'Hokusai', year: 'c. 1831', article: 'The Great Wave off Kanagawa' },
      { title: 'The Starry Night', artist: 'Vincent van Gogh', year: '1889', article: 'The Starry Night' },
      { title: 'The Scream', artist: 'Edvard Munch', year: '1893', article: 'The Scream' },
      { title: 'The Persistence of Memory', artist: 'Salvador Dalí', year: '1931', article: 'The Persistence of Memory' },
      { title: 'Guernica', artist: 'Pablo Picasso', year: '1937', article: 'Guernica (Picasso)' },
    ],
  },
  {
    id: 'sculpture',
    name: 'Sculpture',
    color: '#dcd6cb',
    works: [
      { title: 'Bust of Nefertiti', artist: 'Thutmose', year: 'c. 1345 BCE', article: 'Nefertiti Bust' },
      { title: 'Terracotta Army', artist: 'Qin dynasty artisans', year: 'c. 210 BCE', article: 'Terracotta Army' },
      { title: 'Winged Victory of Samothrace', artist: 'Unknown', year: 'c. 190 BCE', article: 'Winged Victory of Samothrace' },
      { title: 'Venus de Milo', artist: 'Alexandros of Antioch', year: 'c. 130 BCE', article: 'Venus de Milo' },
      { title: 'Moai', artist: 'The Rapa Nui people', year: 'c. 1250–1500', article: 'Moai' },
      { title: 'Pietà', artist: 'Michelangelo', year: '1499', article: 'Pietà (Michelangelo)' },
      { title: 'David', artist: 'Michelangelo', year: '1504', article: 'David (Michelangelo)' },
      { title: 'The Thinker', artist: 'Auguste Rodin', year: '1904', article: 'The Thinker' },
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture',
    color: '#c8b48a',
    works: [
      { title: 'Great Pyramid of Giza', artist: 'Hemiunu (attributed)', year: 'c. 2560 BCE', article: 'Great Pyramid of Giza' },
      { title: 'Parthenon', artist: 'Iktinos and Kallikrates', year: '432 BCE', article: 'Parthenon' },
      { title: 'Pantheon', artist: 'Unknown, Rome', year: 'c. 126', article: 'Pantheon, Rome' },
      { title: 'Hagia Sophia', artist: 'Anthemius and Isidore', year: '537', article: 'Hagia Sophia' },
      { title: 'Angkor Wat', artist: 'Khmer Empire', year: '12th century', article: 'Angkor Wat' },
      { title: 'Notre-Dame de Paris', artist: 'Unknown', year: '1345', article: 'Notre-Dame de Paris' },
      { title: 'Alhambra', artist: 'Nasrid dynasty', year: '14th century', article: 'Alhambra' },
      { title: 'Forbidden City', artist: 'Kuai Xiang', year: '1420', article: 'Forbidden City' },
      { title: 'Taj Mahal', artist: 'Ustad Ahmad Lahori', year: '1653', article: 'Taj Mahal' },
      { title: 'Sagrada Família', artist: 'Antoni Gaudí', year: '1882–', article: 'Sagrada Família' },
      { title: 'Fallingwater', artist: 'Frank Lloyd Wright', year: '1939', article: 'Fallingwater' },
    ],
  },
  {
    id: 'literature',
    name: 'Literature',
    color: '#f2cf6b',
    works: [
      { title: 'Epic of Gilgamesh', artist: 'Unknown', year: 'c. 2100 BCE', article: 'Epic of Gilgamesh' },
      { title: 'The Iliad', artist: 'Homer', year: '8th century BCE', article: 'Iliad' },
      { title: 'The Odyssey', artist: 'Homer', year: '8th century BCE', article: 'Odyssey' },
      { title: 'Mahabharata', artist: 'Vyasa (attributed)', year: 'c. 400 BCE – 400 CE', article: 'Mahabharata' },
      { title: 'The Tale of Genji', artist: 'Murasaki Shikibu', year: 'c. 1010', article: 'The Tale of Genji' },
      { title: 'Divine Comedy', artist: 'Dante Alighieri', year: '1320', article: 'Divine Comedy' },
      { title: 'Hamlet', artist: 'William Shakespeare', year: 'c. 1601', article: 'Hamlet' },
      { title: 'Don Quixote', artist: 'Miguel de Cervantes', year: '1605', article: 'Don Quixote' },
      { title: 'Pride and Prejudice', artist: 'Jane Austen', year: '1813', article: 'Pride and Prejudice' },
      { title: 'War and Peace', artist: 'Leo Tolstoy', year: '1869', article: 'War and Peace' },
      { title: 'Things Fall Apart', artist: 'Chinua Achebe', year: '1958', article: 'Things Fall Apart' },
      { title: 'One Hundred Years of Solitude', artist: 'Gabriel García Márquez', year: '1967', article: 'One Hundred Years of Solitude' },
    ],
  },
  {
    id: 'music',
    name: 'Music',
    color: '#8fd6ff',
    works: [
      { title: 'The Four Seasons', artist: 'Antonio Vivaldi', year: '1725', article: 'The Four Seasons (Vivaldi)' },
      { title: 'Goldberg Variations', artist: 'Johann Sebastian Bach', year: '1741', article: 'Goldberg Variations' },
      { title: 'Messiah', artist: 'George Frideric Handel', year: '1741', article: 'Messiah (Handel)' },
      { title: 'Requiem', artist: 'Wolfgang Amadeus Mozart', year: '1791', article: 'Requiem (Mozart)' },
      { title: 'Symphony No. 9', artist: 'Ludwig van Beethoven', year: '1824', article: 'Symphony No. 9 (Beethoven)' },
      { title: 'The Rite of Spring', artist: 'Igor Stravinsky', year: '1913', article: 'The Rite of Spring' },
      { title: 'Kind of Blue', artist: 'Miles Davis', year: '1959', article: 'Kind of Blue' },
      { title: "Sgt. Pepper's Lonely Hearts Club Band", artist: 'The Beatles', year: '1967', article: "Sgt. Pepper's Lonely Hearts Club Band" },
      { title: 'Thriller', artist: 'Michael Jackson', year: '1982', article: 'Thriller (album)' },
    ],
  },
  {
    id: 'film',
    name: 'Film',
    color: '#d8e4f7',
    works: [
      { title: 'Metropolis', artist: 'Fritz Lang', year: '1927', article: 'Metropolis (1927 film)' },
      { title: 'Citizen Kane', artist: 'Orson Welles', year: '1941', article: 'Citizen Kane' },
      { title: 'Casablanca', artist: 'Michael Curtiz', year: '1942', article: 'Casablanca (film)' },
      { title: 'Tokyo Story', artist: 'Yasujirō Ozu', year: '1953', article: 'Tokyo Story' },
      { title: 'Seven Samurai', artist: 'Akira Kurosawa', year: '1954', article: 'Seven Samurai' },
      { title: '2001: A Space Odyssey', artist: 'Stanley Kubrick', year: '1968', article: '2001: A Space Odyssey (film)' },
      { title: 'The Godfather', artist: 'Francis Ford Coppola', year: '1972', article: 'The Godfather' },
      { title: 'Star Wars', artist: 'George Lucas', year: '1977', article: 'Star Wars (film)' },
      { title: 'Spirited Away', artist: 'Hayao Miyazaki', year: '2001', article: 'Spirited Away' },
    ],
  },
  {
    id: 'fashion',
    name: 'Fashion',
    color: '#f0b7a0',
    works: [
      { title: 'Little black dress', artist: 'Coco Chanel', year: '1926', article: 'Little black dress' },
      { title: 'The New Look', artist: 'Christian Dior', year: '1947', article: 'Christian Dior' },
      { title: 'Le Smoking', artist: 'Yves Saint Laurent', year: '1966', article: 'Le Smoking' },
      { title: 'Wrap dress', artist: 'Diane von Fürstenberg', year: '1974', article: 'Wrap dress' },
    ],
  },
  {
    id: 'games',
    name: 'Games',
    color: '#86dda3',
    works: [
      { title: 'Pac-Man', artist: 'Toru Iwatani, Namco', year: '1980', article: 'Pac-Man' },
      { title: 'Tetris', artist: 'Alexey Pajitnov', year: '1984', article: 'Tetris' },
      { title: 'Super Mario Bros.', artist: 'Shigeru Miyamoto, Nintendo', year: '1985', article: 'Super Mario Bros.' },
      { title: 'Ocarina of Time', artist: 'Nintendo', year: '1998', article: 'The Legend of Zelda: Ocarina of Time' },
      { title: 'Minecraft', artist: 'Markus Persson, Mojang', year: '2011', article: 'Minecraft' },
    ],
  },
]
