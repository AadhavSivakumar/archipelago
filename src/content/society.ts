/**
 * The Anthropologic Alps: how people live together, as waymarks on the
 * mountain paths.
 *
 * Six trails, one per theme of the district's brief — culture, politics,
 * law, business, wellness, cuisine — each a cluster of signposts on its own
 * stretch of slope. The items are the things a general reader would expect
 * a survey of each theme to name: the festivals, the forms of government,
 * the legal ideas, the institutions of trade, the practices of health, and
 * the dishes that have travelled furthest.
 */
export type SocietyItem = { name: string; article: string }

export type SocietyGroup = {
  id: string
  name: string
  color: string
  note: string
  items: readonly SocietyItem[]
}

export const SOCIETY: readonly SocietyGroup[] = [
  {
    id: 'culture',
    name: 'Culture',
    color: '#e8a06a',
    note: 'What a people celebrates.',
    items: [
      { name: 'Diwali', article: 'Diwali' },
      { name: 'Lunar New Year', article: 'Lunar New Year' },
      { name: 'Carnival', article: 'Carnival' },
      { name: 'Day of the Dead', article: 'Day of the Dead' },
      { name: 'Ramadan', article: 'Ramadan' },
      { name: 'Nowruz', article: 'Nowruz' },
      { name: 'Holi', article: 'Holi' },
      { name: 'Hanami', article: 'Hanami' },
      { name: 'Eid al-Fitr', article: 'Eid al-Fitr' },
      { name: 'Christmas', article: 'Christmas' },
      { name: 'Thanksgiving', article: 'Thanksgiving' },
      { name: 'Oktoberfest', article: 'Oktoberfest' },
      { name: 'Passover', article: 'Passover' },
      { name: 'Songkran', article: 'Songkran (Thailand)' },
      { name: 'Vesak', article: 'Vesak' },
    ],
  },
  {
    id: 'politics',
    name: 'Politics',
    color: '#d8e4f7',
    note: 'How a people decides.',
    items: [
      { name: 'Democracy', article: 'Democracy' },
      { name: 'Republic', article: 'Republic' },
      { name: 'Monarchy', article: 'Monarchy' },
      { name: 'Federalism', article: 'Federalism' },
      { name: 'Parliamentary system', article: 'Parliamentary system' },
      { name: 'Presidential system', article: 'Presidential system' },
      { name: 'Constitution', article: 'Constitution' },
      { name: 'Political party', article: 'Political party' },
      { name: 'Election', article: 'Election' },
      { name: 'Separation of powers', article: 'Separation of powers' },
      { name: 'Authoritarianism', article: 'Authoritarianism' },
      { name: 'Diplomacy', article: 'Diplomacy' },
      { name: 'Citizenship', article: 'Citizenship' },
      { name: 'Nation state', article: 'Nation state' },
    ],
  },
  {
    id: 'law',
    name: 'Law',
    color: '#c9b6ff',
    note: 'How a people binds itself.',
    items: [
      { name: 'Common law', article: 'Common law' },
      { name: 'Civil law', article: 'Civil law (legal system)' },
      { name: 'Sharia', article: 'Sharia' },
      { name: 'Rule of law', article: 'Rule of law' },
      { name: 'Jury', article: 'Jury' },
      { name: 'Human rights', article: 'Human rights' },
      { name: 'Contract', article: 'Contract' },
      { name: 'Property law', article: 'Property law' },
      { name: 'Criminal law', article: 'Criminal law' },
      { name: 'Supreme court', article: 'Supreme court' },
      { name: 'International law', article: 'International law' },
      { name: 'Judiciary', article: 'Judiciary' },
      { name: 'Habeas corpus', article: 'Habeas corpus' },
      { name: 'Legislature', article: 'Legislature' },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    color: '#f2cf6b',
    note: 'How a people trades.',
    items: [
      { name: 'Trade', article: 'Trade' },
      { name: 'Money', article: 'Money' },
      { name: 'Bank', article: 'Bank' },
      { name: 'Corporation', article: 'Corporation' },
      { name: 'Stock market', article: 'Stock market' },
      { name: 'Entrepreneurship', article: 'Entrepreneurship' },
      { name: 'Marketing', article: 'Marketing' },
      { name: 'Supply chain', article: 'Supply chain' },
      { name: 'Insurance', article: 'Insurance' },
      { name: 'Accounting', article: 'Accounting' },
      { name: 'Economics', article: 'Economics' },
      { name: 'Silk Road', article: 'Silk Road' },
      { name: 'Guild', article: 'Guild' },
      { name: 'Cooperative', article: 'Cooperative' },
      { name: 'Advertising', article: 'Advertising' },
    ],
  },
  {
    id: 'wellness',
    name: 'Wellness',
    color: '#86dda3',
    note: 'How a people keeps.',
    items: [
      { name: 'Sleep', article: 'Sleep' },
      { name: 'Nutrition', article: 'Nutrition' },
      { name: 'Exercise', article: 'Exercise' },
      { name: 'Meditation', article: 'Meditation' },
      { name: 'Yoga', article: 'Yoga' },
      { name: 'Public health', article: 'Public health' },
      { name: 'Vaccine', article: 'Vaccine' },
      { name: 'Mental health', article: 'Mental health' },
      { name: 'Hygiene', article: 'Hygiene' },
      { name: 'Sanitation', article: 'Sanitation' },
      { name: 'Longevity', article: 'Longevity' },
      { name: 'Sport', article: 'Sport' },
      { name: 'Ageing', article: 'Ageing' },
    ],
  },
  {
    id: 'cuisine',
    name: 'Cuisine',
    color: '#f0b7a0',
    note: 'How a people eats.',
    items: [
      { name: 'Bread', article: 'Bread' },
      { name: 'Rice', article: 'Rice' },
      { name: 'Noodles', article: 'Noodle' },
      { name: 'Pasta', article: 'Pasta' },
      { name: 'Sushi', article: 'Sushi' },
      { name: 'Pizza', article: 'Pizza' },
      { name: 'Curry', article: 'Curry' },
      { name: 'Taco', article: 'Taco' },
      { name: 'Kimchi', article: 'Kimchi' },
      { name: 'Cheese', article: 'Cheese' },
      { name: 'Chocolate', article: 'Chocolate' },
      { name: 'Coffee', article: 'Coffee' },
      { name: 'Tea', article: 'Tea' },
      { name: 'Wine', article: 'Wine' },
      { name: 'Beer', article: 'Beer' },
      { name: 'Dumpling', article: 'Dumpling' },
      { name: 'Couscous', article: 'Couscous' },
      { name: 'Jollof rice', article: 'Jollof rice' },
      { name: 'Ceviche', article: 'Ceviche' },
      { name: 'Hummus', article: 'Hummus' },
      { name: 'Kebab', article: 'Kebab' },
      { name: 'Barbecue', article: 'Barbecue' },
    ],
  },
]
